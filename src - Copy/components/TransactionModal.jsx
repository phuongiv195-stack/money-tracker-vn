import { useState, useEffect } from 'react';
import { addDoc, updateDoc, doc, collection } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Transaction Modal - Converted from Google Apps Script
 * Shows Add Transaction form when user clicks on investment card
 */
const TransactionModal = ({ investment, onClose, onSuccess, editingTransaction = null }) => {
  const isOpenFund = investment.category === 'open_fund';
  const isEditing = !!editingTransaction;
  
  // Form state
  const [action, setAction] = useState('buy');
  const [showSellFields, setShowSellFields] = useState(false);
  const [showTaxField, setShowTaxField] = useState(false);
  
  // Fund Buy fields
  const [bankDate, setBankDate] = useState('');
  const [bank, setBank] = useState('');
  const [bankAmount, setBankAmount] = useState('');
  const [purchasedDate, setPurchasedDate] = useState('');
  const [investedAmount, setInvestedAmount] = useState('');
  const [purchaseNAV, setPurchaseNAV] = useState('');
  const [volume, setVolume] = useState(0);
  const [feePercent, setFeePercent] = useState(0);
  
  // Fund Sell fields
  const [orderDate, setOrderDate] = useState('');
  const [approvedDate, setApprovedDate] = useState('');
  const [sellVolume, setSellVolume] = useState('');
  const [sellNAV, setSellNAV] = useState('');
  const [grossAmount, setGrossAmount] = useState('');
  const [netAmount, setNetAmount] = useState('');
  const [sellTax, setSellTax] = useState('');
  const [sellFee, setSellFee] = useState('');
  const [sellFeePercent, setSellFeePercent] = useState('2');
  const [sellFeeCustomPct, setSellFeeCustomPct] = useState('');
  
  // Stock/ETF fields
  const [tradeDate, setTradeDate] = useState('');
  const [broker, setBroker] = useState('VNDirect');
  const [orderType, setOrderType] = useState('LO');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [stockVolume, setStockVolume] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [tax, setTax] = useState('');
  
  // Common
  const [note, setNote] = useState('');
  
  // Format currency input
  const formatCurrency = (value) => {
    const num = value.replace(/[^\d]/g, '');
    return num ? parseInt(num).toLocaleString('vi-VN') : '';
  };
  
  const parseCurrency = (value) => {
    return parseFloat(value.replace(/[^\d]/g, '')) || 0;
  };
  
  // Calculate Fund Volume (auto)
  useEffect(() => {
    if (isOpenFund && action === 'buy') {
      const invested = parseCurrency(investedAmount);
      const nav = parseCurrency(purchaseNAV);
      if (nav > 0) {
        setVolume((invested / nav).toFixed(2));
      } else {
        setVolume(0);
      }
    }
  }, [investedAmount, purchaseNAV, isOpenFund, action]);
  
  // Calculate Fund Sell amounts
  useEffect(() => {
    if (isOpenFund && action === 'sell') {
      const vol = parseCurrency(sellVolume);
      const nav = parseCurrency(sellNAV);
      const gross = vol * nav;
      setGrossAmount(gross.toLocaleString('vi-VN'));
      
      // Tax 0.1%
      const taxAmount = gross * 0.001;
      setSellTax(taxAmount.toLocaleString('vi-VN'));
      
      // Fee
      let feeAmount = 0;
      if (sellFeePercent === 'custom') {
        const customPct = parseFloat(sellFeeCustomPct) || 0;
        feeAmount = gross * (customPct / 100);
      } else {
        const pct = parseFloat(sellFeePercent) || 0;
        feeAmount = gross * (pct / 100);
      }
      setSellFee(feeAmount.toLocaleString('vi-VN'));
      
      // Net amount
      const net = gross - taxAmount - feeAmount;
      setNetAmount(net.toLocaleString('vi-VN'));
    }
  }, [sellVolume, sellNAV, sellFeePercent, sellFeeCustomPct, isOpenFund, action]);
  
  // Calculate Stock/ETF Fee
  useEffect(() => {
    if (!isOpenFund) {
      const vol = parseCurrency(stockVolume);
      const pr = parseCurrency(price);
      const cost = vol * pr;
      
      // Fee based on broker
      let feeRate = 0.0015; // Default 0.15%
      if (broker === 'SSI') feeRate = 0.0015;
      if (broker === 'TCBS') feeRate = 0.0015;
      
      const feeAmount = cost * feeRate;
      setFee(feeAmount.toLocaleString('vi-VN'));
      
      // Tax for sell (0.1%)
      if (action === 'sell') {
        const taxAmount = cost * 0.001;
        setTax(taxAmount.toLocaleString('vi-VN'));
      }
    }
  }, [stockVolume, price, broker, action, isOpenFund]);
  
  // Toggle fields when action changes
  useEffect(() => {
    setShowSellFields(action === 'sell');
    setShowTaxField(action === 'sell' && !isOpenFund);
  }, [action, isOpenFund]);
  
  // Handle save
  const handleSave = async () => {
    try {
      const transactionData = {
        investmentId: investment.id,
        action,
        note,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      if (isOpenFund) {
        if (action === 'buy') {
          transactionData.bankDate = bankDate;
          transactionData.bank = bank;
          transactionData.bankAmount = parseCurrency(bankAmount);
          transactionData.purchasedDate = purchasedDate;
          transactionData.investedAmount = parseCurrency(investedAmount);
          transactionData.purchaseNAV = parseCurrency(purchaseNAV);
          transactionData.volume = parseFloat(volume);
          transactionData.feePercent = parseFloat(feePercent);
          transactionData.fee = 0;
          transactionData.tax = 0;
        } else {
          // Sell
          transactionData.bankDate = orderDate;
          transactionData.purchasedDate = approvedDate;
          transactionData.volume = parseCurrency(sellVolume);
          transactionData.purchaseNAV = parseCurrency(sellNAV); // sellNAV stored in purchaseNAV
          transactionData.investedAmount = parseCurrency(grossAmount);
          transactionData.bankAmount = parseCurrency(netAmount);
          transactionData.fee = parseCurrency(sellFee);
          transactionData.tax = parseCurrency(sellTax);
        }
      } else {
        // Stock/ETF
        transactionData.tradeDate = tradeDate;
        transactionData.broker = broker;
        transactionData.orderType = orderType;
        transactionData.effectiveDate = effectiveDate;
        transactionData.expiryDate = expiryDate;
        transactionData.volume = parseCurrency(stockVolume);
        transactionData.price = parseCurrency(price);
        transactionData.fee = parseCurrency(fee);
        transactionData.tax = action === 'sell' ? parseCurrency(tax) : 0;
        
        // Calculate invested amount
        const cost = transactionData.volume * transactionData.price;
        transactionData.investedAmount = action === 'buy' 
          ? cost + transactionData.fee 
          : cost - transactionData.fee - transactionData.tax;
      }
      
      if (isEditing) {
        // Update existing transaction
        await updateDoc(doc(db, 'transactions', editingTransaction.id), transactionData);
      } else {
        // Add new transaction
        await addDoc(collection(db, 'transactions'), transactionData);
      }
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Error saving transaction: ' + error.message);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{investment.name}</h2>
            <p className="text-sm text-gray-500">{investment.type}</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            &times;
          </button>
        </div>
        
        {/* Add Transaction Form */}
        <div className="p-6">
          <div className={`${isOpenFund ? 'bg-blue-50' : 'bg-green-50'} rounded-xl p-4 mb-4`}>
            <h3 className="font-semibold mb-3 text-gray-800">
              Add Transaction
            </h3>
            
            {isOpenFund ? (
              // MUTUAL FUND FORM
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Action</label>
                  <select 
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                
                {!showSellFields && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Transfer Date</label>
                      <input 
                        type="date"
                        value={bankDate}
                        onChange={(e) => setBankDate(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Bank</label>
                      <input 
                        type="text"
                        value={bank}
                        onChange={(e) => setBank(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                        placeholder="VCB"
                      />
                    </div>
                  </>
                )}
                
                {/* BUY FIELDS */}
                {!showSellFields && (
                  <div className="col-span-3 grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Transfer Amount</label>
                      <input 
                        type="text"
                        value={bankAmount}
                        onChange={(e) => setBankAmount(formatCurrency(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 font-medium text-blue-600"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Approved Date</label>
                      <input 
                        type="date"
                        value={purchasedDate}
                        onChange={(e) => setPurchasedDate(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Invested Amount</label>
                      <input 
                        type="text"
                        value={investedAmount}
                        onChange={(e) => setInvestedAmount(formatCurrency(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 font-medium text-blue-600"
                        inputMode="decimal"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Purchase NAV</label>
                      <input 
                        type="text"
                        value={purchaseNAV}
                        onChange={(e) => setPurchaseNAV(formatCurrency(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 font-medium text-green-600"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Volume (Units)</label>
                      <input 
                        type="number"
                        value={volume}
                        readOnly
                        className="w-full border rounded-lg px-3 py-2 bg-gray-100"
                        placeholder="Auto-calc"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Fee (%)</label>
                      <input 
                        type="text"
                        value={feePercent}
                        onChange={(e) => setFeePercent(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 bg-gray-100"
                        readOnly
                      />
                    </div>
                  </div>
                )}
                
                {/* SELL FIELDS */}
                {showSellFields && (
                  <div className="col-span-3 grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Order Date</label>
                      <input 
                        type="date"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Approved Date</label>
                      <input 
                        type="date"
                        value={approvedDate}
                        onChange={(e) => setApprovedDate(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Volume to Sell</label>
                      <input 
                        type="text"
                        value={sellVolume}
                        onChange={(e) => setSellVolume(formatCurrency(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 font-medium text-red-600"
                        inputMode="decimal"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Sell NAV</label>
                      <input 
                        type="text"
                        value={sellNAV}
                        onChange={(e) => setSellNAV(formatCurrency(e.target.value))}
                        className="w-full border rounded-lg px-3 py-2 font-medium text-orange-600"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Gross Amount</label>
                      <input 
                        type="text"
                        value={grossAmount}
                        readOnly
                        className="w-full border rounded-lg px-3 py-2 bg-gray-100 font-medium"
                        placeholder="Auto-calc"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Net Amount</label>
                      <input 
                        type="text"
                        value={netAmount}
                        readOnly
                        className="w-full border rounded-lg px-3 py-2 bg-gray-100 font-medium text-green-600"
                        placeholder="Auto-calc"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Tax (0.1% auto)</label>
                      <input 
                        type="text"
                        value={sellTax}
                        readOnly
                        className="w-full border rounded-lg px-3 py-2 bg-amber-50 font-medium text-orange-600"
                        placeholder="Auto 0.1%"
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">Fee</label>
                      <div className="grid grid-cols-3 gap-2">
                        <select 
                          value={sellFeePercent}
                          onChange={(e) => setSellFeePercent(e.target.value)}
                          className="border rounded-lg px-2 py-2 text-sm"
                        >
                          <option value="0">0%</option>
                          <option value="0.3">0.3%</option>
                          <option value="0.5">0.5%</option>
                          <option value="1">1%</option>
                          <option value="1.5">1.5%</option>
                          <option value="2">2%</option>
                          <option value="2.5">2.5%</option>
                          <option value="custom">Custom</option>
                        </select>
                        <div className="relative">
                          <input 
                            type="text"
                            value={sellFeeCustomPct}
                            onChange={(e) => setSellFeeCustomPct(e.target.value)}
                            className="w-full border rounded-lg px-2 py-2 pr-6 text-sm font-medium text-purple-600"
                            inputMode="decimal"
                            placeholder="0.00"
                            disabled={sellFeePercent !== 'custom'}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                        </div>
                        <input 
                          type="text"
                          value={sellFee}
                          readOnly
                          className="border rounded-lg px-2 py-2 font-medium text-orange-600"
                          placeholder="Amount"
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="col-span-3">
                  <label className="block text-sm font-medium mb-1">Note</label>
                  <input 
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
            ) : (
              // STOCK/ETF FORM
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Action</label>
                  <select 
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input 
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Broker</label>
                  <select 
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="VNDirect">VNDirect</option>
                    <option value="SSI">SSI</option>
                    <option value="TCBS">TCBS</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Order Type</label>
                  <select 
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="LO">LO (Limit Order)</option>
                    <option value="MP">MP (Market Price)</option>
                    <option value="ATO">ATO</option>
                    <option value="ATC">ATC</option>
                    <option value="GTD">GTD (Good Till Date)</option>
                    <option value="Stop Limit">Stop Limit</option>
                    <option value="Trailing Stop">Trailing Stop Limit</option>
                    <option value="OCO">OCO (One Cancels Other)</option>
                    <option value="SL/TP">Stop Loss / Take Profit</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Volume</label>
                  <input 
                    type="text"
                    value={stockVolume}
                    onChange={(e) => setStockVolume(formatCurrency(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 font-medium text-green-600"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Price</label>
                  <input 
                    type="text"
                    value={price}
                    onChange={(e) => setPrice(formatCurrency(e.target.value))}
                    className="w-full border rounded-lg px-3 py-2 font-medium text-green-600"
                    inputMode="decimal"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Fee (auto)</label>
                  <input 
                    type="text"
                    value={fee}
                    readOnly
                    className="w-full border rounded-lg px-3 py-2 bg-gray-100 font-medium text-orange-600"
                  />
                </div>
                
                {showTaxField && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Tax 0.1% (auto)</label>
                    <input 
                      type="text"
                      value={tax}
                      readOnly
                      className="w-full border rounded-lg px-3 py-2 bg-gray-100 font-medium text-red-600"
                    />
                  </div>
                )}
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Note</label>
                  <input 
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
            )}
            
            <div className="flex gap-2 mt-3">
              <button 
                onClick={handleSave}
                className={`${isOpenFund ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} text-white px-4 py-2 rounded-lg`}
              >
                {isEditing ? 'Update' : 'Add'}
              </button>
              {isEditing && (
                <button 
                  onClick={onClose}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          
          {/* View Transaction History Button */}
          <button
            onClick={() => {/* TODO: Open Transaction History Modal */}}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <span>📜</span>
            <span>View Transaction History</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionModal;
