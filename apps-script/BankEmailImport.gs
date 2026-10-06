/**
 * Money Tracker – bank email import (Google Apps Script)
 *
 * Runs every 5 minutes in the Gmail account that receives the bank emails and
 * copies new transaction emails (Timo, VCB, BV) into Money Tracker's bankInbox.
 * The Money Tracker web app then turns them into transactions, the same way it
 * handles phone notifications from the Android capture app.
 *
 * Setup (once): see apps-script/README.md
 *   1. Script Properties: MT_EMAIL, MT_PASSWORD (your Money Tracker login)
 *   2. Run setup()  – signs in once, stores a refresh token, deletes the password,
 *                     and schedules checkBankEmails() every 5 minutes.
 */

// Same Firebase project as the web app (src/services/firebase.js); the web API key is public.
const FIREBASE_API_KEY = 'AIzaSyA3e4bfmZev-pBM1FFb_mhh8YWe6ObboXk';
const FIREBASE_PROJECT_ID = 'money-tracker-vn';

// Transaction emails only (sender + subject), so promotions are never sent.
const SEARCH = [
  'from:support@timo.vn subject:"Transaction Notice"',
  'from:vietcombank.com.vn subject:"Biên lai"',
  'from:bvbank.net.vn subject:"giao dịch thành công"',
].map(q => '(' + q + ')').join(' OR ');
const SEARCH_RECENT = '(' + SEARCH + ') newer_than:3d';

const MAX_REMEMBERED = 1000; // message ids kept to avoid sending an email twice

function setup() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('MT_EMAIL');
  const password = props.getProperty('MT_PASSWORD');
  if (!email || !password) {
    throw new Error('Add MT_EMAIL and MT_PASSWORD under Project Settings → Script Properties, then run setup again.');
  }

  const res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
      muteHttpExceptions: true,
    }
  );
  const json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Money Tracker sign-in failed: ' + (json.error && json.error.message));
  }

  props.setProperty('MT_REFRESH_TOKEN', json.refreshToken);
  props.setProperty('MT_USER_ID', json.localId);
  props.deleteProperty('MT_PASSWORD'); // never kept
  // Only emails from now on: earlier transactions were entered by hand
  if (!props.getProperty('IMPORT_SINCE')) props.setProperty('IMPORT_SINCE', new Date().toISOString());

  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'checkBankEmails')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkBankEmails').timeBased().everyMinutes(5).create();

  Logger.log('Done. Bank emails received after ' + props.getProperty('IMPORT_SINCE') + ' will be sent every 5 minutes.');
}

function checkBankEmails() {
  const props = PropertiesService.getScriptProperties();
  const since = new Date(props.getProperty('IMPORT_SINCE') || 0);
  const processed = JSON.parse(props.getProperty('PROCESSED_IDS') || '[]');
  const seen = new Set(processed);

  let token = null;
  let sent = 0;
  GmailApp.search(SEARCH_RECENT, 0, 50).forEach(thread => {
    // A thread can hold older emails with the same subject; only new ones count
    thread.getMessages().forEach(message => {
      const id = message.getId();
      if (seen.has(id) || message.getDate() < since) return;
      token = token || getIdToken_(props);
      sendToInbox_(token, props.getProperty('MT_USER_ID'), message);
      seen.add(id);
      processed.push(id);
      sent++;
    });
  });

  if (sent > 0) {
    props.setProperty('PROCESSED_IDS', JSON.stringify(processed.slice(-MAX_REMEMBERED)));
    Logger.log('Sent ' + sent + ' bank email(s) to Money Tracker.');
  }
}

function getIdToken_(props) {
  const refreshToken = props.getProperty('MT_REFRESH_TOKEN');
  if (!refreshToken) throw new Error('Not set up yet: run setup() first.');
  const res = UrlFetchApp.fetch('https://securetoken.googleapis.com/v1/token?key=' + FIREBASE_API_KEY, {
    method: 'post',
    payload: { grant_type: 'refresh_token', refresh_token: refreshToken },
    muteHttpExceptions: true,
  });
  const json = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Money Tracker sign-in expired (password changed?). Add MT_PASSWORD again and run setup(). ' +
      (json.error && json.error.message));
  }
  if (json.refresh_token && json.refresh_token !== refreshToken) {
    props.setProperty('MT_REFRESH_TOKEN', json.refresh_token);
  }
  return json.id_token;
}

// Same document shape as the Android app writes, with source 'email'.
function sendToInbox_(token, userId, message) {
  const body = message.getPlainBody().slice(0, 20000);
  const from = message.getFrom();
  const str = v => ({ stringValue: String(v) });
  const time = d => ({ timestampValue: d.toISOString() });

  const doc = {
    fields: {
      userId: str(userId),
      status: str('new'),
      source: str('email'),
      device: str('gmail'),
      packageName: str('email'),
      appName: str(from.replace(/\s*<.*>\s*$/, '').replace(/"/g, '') || from),
      from: str(from),
      title: str(message.getSubject()),
      text: str(body),
      bigText: str(body),
      postedAt: time(message.getDate()),
      capturedAt: time(new Date()),
      isTest: { booleanValue: false },
    },
  };

  const url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/bankInbox?documentId=email_' + message.getId();
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(doc),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200 && code !== 409) { // 409 = already sent
    throw new Error('Firestore error ' + code + ': ' + res.getContentText().slice(0, 300));
  }
}
