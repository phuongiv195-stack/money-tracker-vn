// Android's back gesture starts at the left or right screen edge. A touch that
// starts there isn't a long press: the system takes the swipe over and the page
// may never see the finger lift, so a long-press timer would still fire.
const EDGE_PX = 32;

export const startsAtScreenEdge = (e) => {
  const x = e?.touches?.[0]?.clientX;
  return x !== undefined && (x < EDGE_PX || x > window.innerWidth - EDGE_PX);
};
