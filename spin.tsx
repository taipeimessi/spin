import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Users, 
  Send, 
  LayoutGrid, 
  BookOpen, 
  Download, 
  Trash2, 
  CheckCircle2, 
  Monitor, 
  ChevronRight, 
  User, 
  Plus,
  HelpCircle,
  X,
  Maximize2
} from 'lucide-react';

// ==========================================
// FIREBASE CONFIGURATION (Environment Provided)
// ==========================================
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'spin-workshop-app';

// 集合路徑規則：/artifacts/{appId}/public/data/{collectionName}
const COLLECTION_PATH = ['artifacts', appId, 'public', 'data', 'spin_submissions'];

export default function App() {
  // 角色：'role-select' (選擇角色) | 'student-form' (學員填寫) | 'admin-dashboard' (講師後台)
  const [currentView, setCurrentView] = useState('role-select');
  const [user, setUser] = useState(null);
  
  // 學員表單狀態
  const [studentName, setStudentName] = useState('');
  const [modelType, setModelType] = useState('');
  const [customerScenario, setCustomerScenario] = useState('');
  const [spinData, setSpinData] = useState({
    S: '',
    P: '',
    I: '',
    N: ''
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 講師後台狀態
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null); // 用於大螢幕焦點投影
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminError, setAdminError] = useState('');

  // 1. 初始化 Firebase 匿名認證 (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Firebase auth failed:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. 訂閱 Firestore 數據即時同步（僅當 user 存在時）
  useEffect(() => {
    if (!user) return;

    const queryCollection = collection(db, ...COLLECTION_PATH);
    
    // 即時監聽 (含錯誤處理)
    const unsubscribe = onSnapshot(
      queryCollection, 
      (snapshot) => {
        const list = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() });
        });
        // 依據時間排序 (新寫的排前面，並在記憶體中處理以避免複雜 Firebase 索引)
        list.sort((a, b) => {
          const tA = a.createdAt?.seconds || 0;
          const tB = b.createdAt?.seconds || 0;
          return tB - tA;
        });
        setSubmissions(list);
      },
      (error) => {
        console.error("Firestore listening error:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 處理學員提交
  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setErrorMessage('連線驗證中，請稍後重試...');
      return;
    }
    if (!studentName.trim()) {
      setErrorMessage('請輸入您的姓名');
      return;
    }
    if (!modelType.trim() || !customerScenario.trim()) {
      setErrorMessage('請填寫機型與客戶情境');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // 使用使用者 UID 作為 Document ID，讓每個人只會有一份資料，重複送出視為更新
      const docRef = doc(db, ...COLLECTION_PATH, user.uid);
      await setDoc(docRef, {
        studentName: studentName.trim(),
        modelType: modelType.trim(),
        customerScenario: customerScenario.trim(),
        spin: spinData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error("Error saving document: ", error);
      setErrorMessage('送出失敗，請檢查網路連線後重試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 處理刪除學員資料
  const handleDeleteSubmission = async (id) => {
    if (confirm(`確定要刪除此學員的 SPIN 資料嗎？`)) {
      try {
        const docRef = doc(db, ...COLLECTION_PATH, id);
        await deleteDoc(docRef);
        if (selectedSubmission?.id === id) {
          setSelectedSubmission(null);
        }
      } catch (error) {
        console.error("Delete failed: ", error);
      }
    }
  };

  // 匯出 CSV 檔
  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // 支援 UTF-8 BOM 中文不亂碼
    csvContent += "時間,學員姓名,機型,客戶情境,S(情境),P(探索/痛點),I(暗示/影響),N(需求效益)\n";
    
    submissions.forEach(sub => {
      const date = sub.createdAt ? new Date(sub.createdAt.seconds * 1000).toLocaleString() : '無時間';
      const row = [
        `"${date}"`,
        `"${sub.studentName}"`,
        `"${sub.modelType}"`,
        `"${sub.customerScenario}"`,
        `"${sub.spin?.S?.replace(/"/g, '""') || ''}"`,
        `"${sub.spin?.P?.replace(/"/g, '""') || ''}"`,
        `"${sub.spin?.I?.replace(/"/g, '""') || ''}"`,
        `"${sub.spin?.N?.replace(/"/g, '""') || ''}"`
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SPIN_Workshop_Submissions_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 驗證講師密碼 (密碼仍為：spin888，但畫面上不再顯示提示)
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === 'spin888') {
      setIsAdminAuthenticated(true);
      setCurrentView('admin-dashboard');
      setAdminError('');
    } else {
      setAdminError('密碼錯誤！請輸入正確的講師密碼');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      
      {/* 頂部導航列 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 text-white p-2 rounded-xl shadow-md shadow-emerald-200">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">SPIN 銷售實戰工作坊</h1>
              <p className="text-xs text-slate-500 font-medium">即時動態演練與投影反饋系統</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentView !== 'role-select' && (
              <button
                onClick={() => {
                  setCurrentView('role-select');
                  setIsSubmitted(false);
                }}
                className="text-xs font-semibold px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
              >
                ← 返回角色選擇
              </button>
            )}

            <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              系統同步中
            </div>
          </div>
        </div>
      </header>

      {/* 主體內容 */}
      <main className="flex-1 flex flex-col">
        
        {/* ==================== 1. 角色選擇畫面 ==================== */}
        {currentView === 'role-select' && (
          <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-slate-50 to-slate-100">
            <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8 my-8">
              
              {/* 學員入口 */}
              <div 
                onClick={() => setCurrentView('student-form')}
                className="group relative bg-white border border-slate-200/80 rounded-2xl p-8 shadow-xl hover:shadow-2xl hover:border-emerald-500/40 cursor-pointer transition-all duration-300 flex flex-col justify-between transform hover:-translate-y-1 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-10 -mt-10 group-hover:bg-emerald-100/70 transition-all duration-300" />
                <div className="relative">
                  <div className="bg-emerald-100 text-emerald-700 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-all">
                    <User className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">我是學員</h2>
                  <p className="text-slate-500 text-sm leading-relaxed mb-6">
                    輸入姓名與產品情境，快速設計您的 SPIN 四大提問，並即時提交至講師大螢幕進行討論。
                  </p>
                </div>
                <div className="flex items-center text-emerald-600 font-bold text-sm group-hover:translate-x-2 transition-transform">
                  進入填寫 SPIN 表單 <ChevronRight className="w-4 h-4 ml-1" />
                </div>
              </div>

              {/* 講師入口 */}
              <div 
                className="group relative bg-white border border-slate-200/80 rounded-2xl p-8 shadow-xl hover:shadow-2xl hover:border-blue-500/40 transition-all duration-300 flex flex-col justify-between transform hover:-translate-y-1 overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-10 -mt-10 group-hover:bg-blue-100/70 transition-all duration-300" />
                <div className="relative">
                  <div className="bg-blue-100 text-blue-700 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-all">
                    <Monitor className="w-8 h-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">我是講師 (後台投影)</h2>
                  <p className="text-slate-500 text-sm leading-relaxed mb-4">
                    即時查看全體學員提交的銷售提問卡片、點選放大至大螢幕展示、匯出實戰數據並進行點評。
                  </p>
                  
                  {/* 密碼驗證框 - 已移除密碼提示 */}
                  <form onSubmit={handleAdminLogin} className="mt-4 space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">講師進入密碼</label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder="請輸入管理員密碼"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="flex-1 text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                      />
                      <button 
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition shadow-md"
                      >
                        驗證
                      </button>
                    </div>
                    {adminError && <p className="text-red-500 text-xs font-semibold">{adminError}</p>}
                  </form>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ==================== 2. 學員填寫 SPIN 表單 ==================== */}
        {currentView === 'student-form' && (
          <div className="max-w-4xl w-full mx-auto p-4 sm:p-6 my-4">
            
            {isSubmitted ? (
              // 提交成功畫面
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xl max-w-lg mx-auto my-12 animate-fade-in">
                <div className="bg-emerald-100 text-emerald-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">您的 SPIN 表單已成功送出！</h3>
                <p className="text-slate-600 mb-6">講師已經可以在大螢幕上看到您的內容囉。如果想要修改，隨時可以直接重新填寫再次送出！</p>
                
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-6 rounded-xl transition shadow-md"
                  >
                    重新修改/填寫
                  </button>
                  <button
                    onClick={() => {
                      setCurrentView('role-select');
                      setIsSubmitted(false);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-6 rounded-xl transition"
                  >
                    回首頁
                  </button>
                </div>
              </div>
            ) : (
              // 填寫表單畫面
              <form onSubmit={handleStudentSubmit} className="space-y-6">
                
                {/* 填寫人基本資訊 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-md space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
                    <span className="bg-emerald-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                    基本資訊
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">學員姓名 <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="請輸入您的姓名"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition bg-slate-50/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">機型 <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="請輸入您銷售的機型名稱"
                        value={modelType}
                        onChange={(e) => setModelType(e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition bg-slate-50/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">客戶情境 <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="例如：傳統製造業，目前使用舊款..."
                        value={customerScenario}
                        onChange={(e) => setCustomerScenario(e.target.value)}
                        className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition bg-slate-50/50"
                      />
                    </div>
                  </div>
                </div>

                {/* SPIN 核心填寫表格 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-lg overflow-hidden">
                  
                  {/* SPIN 標題列與結構設計 */}
                  <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        <span className="bg-emerald-500 text-slate-900 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                        SPIN 銷售提問設計
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">針對客戶情境，設計出合適的提問流程</p>
                    </div>
                    <span className="text-xs font-bold bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">SPIN Framework</span>
                  </div>

                  {/* 表格主體 */}
                  <div className="divide-y divide-slate-200">
                    
                    {/* S 情境式問題 */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
                      <div className="md:col-span-3 bg-slate-50/60 p-4 flex flex-col justify-center items-center text-center md:border-r border-slate-200">
                        <span className="text-4xl font-extrabold text-slate-950 font-serif">S</span>
                        <span className="text-sm font-bold text-slate-800 mt-1">情境式問題</span>
                        <span className="text-[10px] text-slate-400 mt-1 max-w-[150px]">Situation Questions</span>
                      </div>
                      <div className="md:col-span-9 p-5 space-y-2">
                        <div className="bg-slate-100/80 text-xs font-medium text-slate-600 px-3 py-2 rounded-lg flex items-start gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                          <span>迅速掌握客戶背景及產品應用情境，為後續談話鋪路。</span>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="請輸入您的情境式提問..."
                          value={spinData.S}
                          onChange={(e) => setSpinData({ ...spinData, S: e.target.value })}
                          className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition resize-y"
                        />
                      </div>
                    </div>

                    {/* P 探索型問題 */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
                      <div className="md:col-span-3 bg-slate-50/60 p-4 flex flex-col justify-center items-center text-center md:border-r border-slate-200">
                        <span className="text-4xl font-extrabold text-slate-950 font-serif">P</span>
                        <span className="text-sm font-bold text-slate-800 mt-1">探索型問題</span>
                        <span className="text-[10px] text-slate-400 mt-1 max-w-[150px]">Problem Questions</span>
                      </div>
                      <div className="md:col-span-9 p-5 space-y-2">
                        <div className="bg-slate-100/80 text-xs font-medium text-slate-600 px-3 py-2 rounded-lg flex items-start gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                          <span>發掘客戶現有產品可能的痛點或未被滿足的需求。</span>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="請輸入您的探索型提問..."
                          value={spinData.P}
                          onChange={(e) => setSpinData({ ...spinData, P: e.target.value })}
                          className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition resize-y"
                        />
                      </div>
                    </div>

                    {/* I 暗示型問題 */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
                      <div className="md:col-span-3 bg-slate-50/60 p-4 flex flex-col justify-center items-center text-center md:border-r border-slate-200">
                        <span className="text-4xl font-extrabold text-slate-950 font-serif">I</span>
                        <span className="text-sm font-bold text-slate-800 mt-1">暗示型問題</span>
                        <span className="text-[10px] text-slate-400 mt-1 max-w-[150px]">Implication Questions</span>
                      </div>
                      <div className="md:col-span-9 p-5 space-y-2">
                        <div className="bg-slate-100/80 text-xs font-medium text-slate-600 px-3 py-2 rounded-lg flex items-start gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                          <span>幫客戶理解問題持續而未解決可能造成的負面影響與連帶損失。</span>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="請輸入您的暗示型提問..."
                          value={spinData.I}
                          onChange={(e) => setSpinData({ ...spinData, I: e.target.value })}
                          className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition resize-y"
                        />
                      </div>
                    </div>

                    {/* N 需求效益問題 */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
                      <div className="md:col-span-3 bg-slate-50/60 p-4 flex flex-col justify-center items-center text-center md:border-r border-slate-200">
                        <span className="text-4xl font-extrabold text-slate-950 font-serif">N</span>
                        <span className="text-sm font-bold text-slate-800 mt-1">需求效益問題</span>
                        <span className="text-[10px] text-slate-400 mt-1 max-w-[150px]">Need-payoff Questions</span>
                      </div>
                      <div className="md:col-span-9 p-5 space-y-2">
                        <div className="bg-slate-100/80 text-xs font-medium text-slate-600 px-3 py-2 rounded-lg flex items-start gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
                          <span>積極正面的提問，鼓勵顧客說出解決問題後的具體好處與效益。</span>
                        </div>
                        <textarea
                          rows={3}
                          placeholder="請輸入您的需求效益提問..."
                          value={spinData.N}
                          onChange={(e) => setSpinData({ ...spinData, N: e.target.value })}
                          className="w-full text-sm p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition resize-y"
                        />
                      </div>
                    </div>

                  </div>
                </div>

                {/* 提交區域 */}
                {errorMessage && (
                  <p className="text-red-600 text-sm font-semibold text-center bg-red-50 py-2 rounded-xl border border-red-200">
                    ⚠️ {errorMessage}
                  </p>
                )}

                <div className="flex justify-end gap-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-10 rounded-xl transition shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? '正在提交中...' : '提交我的 SPIN 表單'}
                    <Send className="w-4 h-4" />
                  </button>
                </div>

              </form>
            )}
          </div>
        )}

        {/* ==================== 3. 講師投影後台大螢幕 ==================== */}
        {currentView === 'admin-dashboard' && (
          <div className="flex-1 flex flex-col p-4 sm:p-6 bg-slate-100">
            
            {/* 後台操作與數據摘要 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-md mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold text-slate-900">學員實戰動態看板</h2>
                  <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {submissions.length} 人已填寫
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">點擊下方任一學員卡片可放大並投影至大螢幕討論</p>
              </div>

              <div className="flex gap-2 w-full md:w-auto">
                <button
                  onClick={exportToCSV}
                  disabled={submissions.length === 0}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-950 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition disabled:opacity-40"
                >
                  <Download className="w-4 h-4" />
                  匯出 Excel/CSV
                </button>
              </div>
            </div>

            {/* 學員資料格線 (Grid) 牆 */}
            {submissions.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center bg-white border border-dashed border-slate-300 rounded-3xl p-12 text-center shadow-inner my-6">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4 animate-pulse">
                  <LayoutGrid className="w-10 h-10" />
                </div>
                <h4 className="text-lg font-bold text-slate-800">等待學員提交中...</h4>
                <p className="text-slate-400 text-xs max-w-sm mt-1">請引導學員透過瀏覽器開啟此頁面，輸入姓名、銷售機型並設計 SPIN 問卷送出。</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {submissions.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-md hover:shadow-xl hover:border-blue-400/50 transition-all duration-300 flex flex-col justify-between overflow-hidden cursor-pointer group"
                    onClick={() => setSelectedSubmission(item)}
                  >
                    
                    {/* 卡片標頭 */}
                    <div className="bg-slate-950 p-4 text-white flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          <span className="font-extrabold text-base tracking-wide">{item.studentName}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">
                          機型：<span className="text-white font-semibold">{item.modelType}</span>
                        </div>
                      </div>
                      
                      {/* 功能按鈕：放大、刪除 */}
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setSelectedSubmission(item)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition"
                          title="投影放大"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSubmission(item.id)}
                          className="p-1.5 bg-red-950 hover:bg-red-800 rounded-lg text-red-300 hover:text-red-200 transition"
                          title="刪除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 客戶情境 */}
                    <div className="px-4 py-2 bg-blue-50/50 border-b border-slate-100">
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">客戶情境</p>
                      <p className="text-xs font-semibold text-slate-700 truncate">{item.customerScenario}</p>
                    </div>

                    {/* SPIN 預覽 */}
                    <div className="p-4 space-y-2.5 flex-1">
                      
                      <div className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-slate-100 text-slate-900 font-serif font-black text-xs flex items-center justify-center border border-slate-200">S</span>
                        <p className="text-xs text-slate-600 line-clamp-2">{item.spin?.S || '尚未填寫'}</p>
                      </div>

                      <div className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-slate-100 text-slate-900 font-serif font-black text-xs flex items-center justify-center border border-slate-200">P</span>
                        <p className="text-xs text-slate-600 line-clamp-2">{item.spin?.P || '尚未填寫'}</p>
                      </div>

                      <div className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-slate-100 text-slate-900 font-serif font-black text-xs flex items-center justify-center border border-slate-200">I</span>
                        <p className="text-xs text-slate-600 line-clamp-2">{item.spin?.I || '尚未填寫'}</p>
                      </div>

                      <div className="flex gap-2">
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-slate-100 text-slate-900 font-serif font-black text-xs flex items-center justify-center border border-slate-200">N</span>
                        <p className="text-xs text-slate-600 line-clamp-2">{item.spin?.N || '尚未填寫'}</p>
                      </div>

                    </div>

                    {/* 卡片底部 */}
                    <div className="bg-slate-50 px-4 py-2.5 text-right border-t border-slate-100 text-[10px] text-slate-400 font-medium">
                      點擊卡片放大分享
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ==================== 4. 滿版焦點投影彈出視窗 (Modal) ==================== */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* 投影視窗 header */}
            <div className="bg-slate-900 text-white p-6 flex justify-between items-center border-b border-slate-800">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md border border-emerald-800">
                  即時焦點分享
                </span>
                <h3 className="text-2xl font-black mt-2 flex items-center gap-2">
                  <span className="text-slate-100">{selectedSubmission.studentName}</span>
                  <span className="text-slate-400 text-base font-normal">的銷售提案</span>
                </h3>
              </div>
              <button 
                onClick={() => setSelectedSubmission(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-2 rounded-xl transition duration-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* 投影視窗 情境機型區 */}
            <div className="bg-blue-50/50 p-6 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">銷售機型 (Model)</span>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">{selectedSubmission.modelType || '未填寫'}</p>
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">客戶情境 (Scenario)</span>
                <p className="text-lg font-extrabold text-slate-900 mt-0.5">{selectedSubmission.customerScenario || '未填寫'}</p>
              </div>
            </div>

            {/* SPIN 四大區塊大字投影 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* S */}
                <div className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-8 h-8 rounded-lg bg-slate-950 text-white font-serif font-black text-base flex items-center justify-center">S</span>
                      <span className="font-bold text-sm text-slate-700">情境式問題</span>
                    </div>
                    <p className="text-slate-500 text-xs mb-3 font-medium">迅速掌握客戶背景及產品應用情境，為後續談話鋪路</p>
                    <p className="text-slate-900 font-semibold whitespace-pre-wrap leading-relaxed text-sm bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[80px]">
                      {selectedSubmission.spin?.S || '（尚未填寫）'}
                    </p>
                  </div>
                </div>

                {/* P */}
                <div className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-8 h-8 rounded-lg bg-slate-950 text-white font-serif font-black text-base flex items-center justify-center">P</span>
                      <span className="font-bold text-sm text-slate-700">探索型問題</span>
                    </div>
                    <p className="text-slate-500 text-xs mb-3 font-medium">發掘客戶現有產品可能的痛點或未被滿足的需求</p>
                    <p className="text-slate-900 font-semibold whitespace-pre-wrap leading-relaxed text-sm bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[80px]">
                      {selectedSubmission.spin?.P || '（尚未填寫）'}
                    </p>
                  </div>
                </div>

                {/* I */}
                <div className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-8 h-8 rounded-lg bg-slate-950 text-white font-serif font-black text-base flex items-center justify-center">I</span>
                      <span className="font-bold text-sm text-slate-700">暗示型問題</span>
                    </div>
                    <p className="text-slate-500 text-xs mb-3 font-medium">幫客戶理解問題持續而未解決可能造成的負面影響</p>
                    <p className="text-slate-900 font-semibold whitespace-pre-wrap leading-relaxed text-sm bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[80px]">
                      {selectedSubmission.spin?.I || '（尚未填寫）'}
                    </p>
                  </div>
                </div>

                {/* N */}
                <div className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-8 h-8 rounded-lg bg-slate-950 text-white font-serif font-black text-base flex items-center justify-center">N</span>
                      <span className="font-bold text-sm text-slate-700">需求效益問題</span>
                    </div>
                    <p className="text-slate-500 text-xs mb-3 font-medium">積極正面的提問，鼓勵顧客說出解決問題後的好處</p>
                    <p className="text-slate-900 font-semibold whitespace-pre-wrap leading-relaxed text-sm bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[80px]">
                      {selectedSubmission.spin?.N || '（尚未填寫）'}
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* 投影視窗 footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-150">
              <span className="text-xs text-slate-400 font-medium">建議搭配大螢幕或投影機全螢幕展示</span>
              <button
                onClick={() => setSelectedSubmission(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-2 px-5 rounded-lg transition"
              >
                關閉投影
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 底部 Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-400 font-medium">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p>© 2026 SPIN 銷售演練平台. All rights reserved.</p>
          <div className="flex gap-4">
            <span>支援即時雲端儲存</span>
            <span>•</span>
            <span>一鍵投影演示功能</span>
          </div>
        </div>
      </footer>

    </div>
  );
}