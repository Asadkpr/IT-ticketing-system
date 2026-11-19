import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Ticket, 
  Plus, 
  LogOut, 
  User, 
  Shield, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  MessageSquare, 
  Send,
  Filter,
  Search,
  ChevronRight,
  UserPlus,
  BarChart3,
  Calendar,
  LayoutDashboard,
  FileText,
  Download,
  RefreshCw,
  TrendingUp,
  Upload,
  Moon,
  Sun,
  Check,
  CheckCheck,
  Bell,
  Menu,
  X,
  Edit2,
  Camera,
  Loader2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from 'recharts';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from '@google/genai';
import { cn } from './lib/utils';
import { db, auth } from './firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { DEFAULT_EMPLOYEES, DEFAULT_TICKETS } from './defaultData';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  setDoc, 
  query, 
  where, 
  orderBy, 
  getDoc,
  getDocs,
  deleteDoc
} from 'firebase/firestore';

// --- Types ---

interface UserPermissions {
  canViewAllTickets: boolean;
  canAssignTickets: boolean;
  canCloseTickets: boolean;
  canViewReports: boolean;
  canManageUsers: boolean;
}

interface AppNotification {
  id: string;
  type: 'ticket' | 'message';
  title: string;
  description: string;
  linkId: string;
  isRead: boolean;
  createdAt: string;
}

interface UserProfile {
  uid: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  role: 'admin' | 'it_member' | 'user';
  status?: 'pending' | 'active' | 'blocked'; // Added for admin approval
  password?: string; // Added for local storage demo
  mustChangePassword?: boolean;
  firstLoginCompleted?: boolean;
  permissions?: UserPermissions;
  profileImg?: string;
}

const DEFAULT_PERMISSIONS: Record<UserProfile['role'], UserPermissions> = {
  admin: {
    canViewAllTickets: true,
    canAssignTickets: true,
    canCloseTickets: true,
    canViewReports: true,
    canManageUsers: true,
  },
  it_member: {
    canViewAllTickets: true,
    canAssignTickets: true,
    canCloseTickets: true,
    canViewReports: false,
    canManageUsers: false,
  },
  user: {
    canViewAllTickets: false,
    canAssignTickets: false,
    canCloseTickets: false,
    canViewReports: false,
    canManageUsers: false,
  },
};

const getUserPermissions = (user: UserProfile | null): UserPermissions => {
  if (!user) return DEFAULT_PERMISSIONS.user;
  return user.permissions || DEFAULT_PERMISSIONS[user.role];
};

interface SupportTicket {
  id: string;
  title: string;
  category: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  createdBy: string;
  creatorName: string;
  department: string;
  assignedTo?: string;
  assignedToName?: string;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedAt?: string;
  closedBy?: string;
  closedByName?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  feedback?: string;
  resolutionComment?: string;
  attachment?: {
    name: string;
    data: string; // base64
  };
}

interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: UserProfile['role'];
  receiverId?: string; // null or undefined for public chat
  targetUserId?: string; // For IT help: who is this message for/about?
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  seenBy: string[];
}

interface TypingIndicator {
  uid: string;
  name: string;
  targetId?: string; // null or undefined for public chat
  timestamp: number;
}

const CATEGORIES = [
  "IT Support",
  "Network Issue",
  "Software installation",
  "Hardware Issue",
  "Email Issue",
  "Printer issue",
  "tonner empty",
  "domain password reset",
  "Others"
];

// --- Components ---

const StatusBadge = ({ status }: { status: SupportTicket['status'] }) => {
  const styles = {
    open: 'bg-blue-100 text-blue-700 border-blue-200',
    'in-progress': 'bg-amber-100 text-amber-700 border-amber-200',
    resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    closed: 'bg-slate-100 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600',
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium border", styles[status])}>
      {status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const PriorityBadge = ({ priority }: { priority: SupportTicket['priority'] }) => {
  const styles = {
    low: 'bg-slate-100 text-slate-600 dark:text-slate-300',
    medium: 'bg-indigo-100 text-indigo-700',
    high: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", styles[priority])}>
      {priority}
    </span>
  );
};

const showNativeNotification = (title: string, options: any) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, options);
      }).catch(() => {
        new Notification(title, options);
      });
    } else {
      new Notification(title, options);
    }
  }
};

const getCachedData = (key: string) => {
  try {
    const sessionStr = localStorage.getItem('it_user_session');
    if (!sessionStr) return [];
    const session = JSON.parse(sessionStr);
    const cachedStr = localStorage.getItem(key);
    if (!cachedStr) return [];
    const cached = JSON.parse(cachedStr);
    if (cached.uid === session.uid) return cached.data;
    return [];
  } catch (e) {
    return [];
  }
};

const setCachedData = (key: string, data: any, uid: string) => {
  try {
    localStorage.setItem(key, JSON.stringify({ uid, data }));
  } catch (e) {
    console.error('Error saving to cache:', e);
  }
};

const normalizeDept = (dept?: string): string => {
  if (!dept) return 'General';
  const d = dept.toLowerCase().trim();
  if (d === 'it' || d.includes('information technology')) return 'IT';
  if (d === 'hr' || d.includes('human resource')) return 'HR';
  if (d.includes('treasurer') || d.includes('account')) return 'Accounts';
  if (d === 'soa' || (d.includes('art') && !d.includes('cinematic') && !d.includes('digital'))) return 'SOA';
  if (d === 'sadu' || d.includes('architecture') || d.includes('urbanism')) return 'SADU';
  if (d === 'sdca' || d.includes('cinematic') || d.includes('digital')) return 'SDCA';
  if (d === 'sir' || d.includes('informatics') || d.includes('robotics')) return 'SIR';
  if (d === 'scl' || d.includes('culture') || d.includes('languages')) return 'SCL';
  if (d.includes('admissions') || d.includes('marketing')) return 'Admissions And marketing';
  if (d.includes('registrar') || d.includes('registrer')) return 'Registrer';
  if (d.includes('administration')) return 'Administrations';
  if (d === 'qec' || d.includes('quality enhancement')) return 'QEC';
  if (d.includes('student')) return 'Students Affair';
  if (d.includes('examination')) return 'Examination';
  if (d.includes('library')) return 'Library';
  if (d.includes('wellbeing')) return 'Center for Wellbeing';
  if (d.includes('supply chain')) return 'Supply Chain';
  if (d.includes('utilities') || d.includes('maintenance')) return 'Utilities & Maintenance';
  if (d.includes('vice chancellor') || d.includes('vc office')) return 'Vice Chancellor Office';
  if (d === 'erp') return 'ERP';
  if (d.includes('soft skill')) return 'Soft Skill';
  return dept;
};

const DEPT_LABELS: Record<string, string> = {
  "IT": "Information Technology (IT)",
  "HR": "Human Resources (HR)",
  "Accounts": "Accounts & Finance",
  "SOA": "School of Art (SOA)",
  "SADU": "School of Architecture & Urbanism (SADU)",
  "SDCA": "School of Digital & Cinematic Art (SDCA)",
  "SIR": "School of Informatics & Robotics (SIR)",
  "SCL": "School of Culture & Languages (SCL)",
  "Admissions And marketing": "Admissions & Marketing",
  "Registrer": "Office of the Registrar",
  "Administrations": "Administration Department",
  "QEC": "Quality Enhancement Cell (QEC)",
  "Students Affair": "Office of Student Affairs",
  "Examination": "Controller of Examinations",
  "Library": "University Library",
  "Center for Wellbeing": "Center for Wellbeing",
  "Supply Chain": "Supply Chain Department",
  "Utilities & Maintenance": "Utilities & Maintenance",
  "Vice Chancellor Office": "Vice Chancellor Office",
  "ERP": "ERP Solutions",
  "Soft Skill": "Soft Skills & Development"
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<SupportTicket[]>(() => {
    const cached = getCachedData('it_tickets');
    return (cached && cached.length > 0) ? cached : (DEFAULT_TICKETS as unknown as SupportTicket[]);
  });
  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => {
    const cached = getCachedData('it_users');
    let baseList = (cached && cached.length > 0) ? cached : (DEFAULT_EMPLOYEES as unknown as UserProfile[]);
    try {
      const customUsers: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
      if (customUsers.length > 0) {
        const baseEmails = new Set(baseList.map(u => u.email.toLowerCase()));
        const extra = customUsers.filter(u => !baseEmails.has(u.email.toLowerCase()));
        baseList = [...extra, ...baseList];
      }
    } catch (e) {}
    return baseList;
  });
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [filter, setFilter] = useState<SupportTicket['status'] | 'all'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<SupportTicket['priority'] | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [view, setView] = useState<'tickets' | 'reports' | 'users' | 'user_management' | 'chat'>('tickets');
  const [reportFilter, setReportFilter] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('daily');
  const [reportBreakdown, setReportBreakdown] = useState<'user' | 'category' | 'agent'>('user');
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'change_password' | 'first_login'>('login');
  const [pendingUser, setPendingUser] = useState<UserProfile | null>(null);
  const [resettingUser, setResettingUser] = useState<UserProfile | null>(null);
  const [forcedNewPassword, setForcedNewPassword] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [resolutionText, setResolutionText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>(() => getCachedData('it_allMessages'));
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatUserSearch, setChatUserSearch] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [selectedChatUser, setSelectedChatUser] = useState<UserProfile | null>(null);
  const DEPARTMENTS = [
    "IT",
    "HR",
    "Accounts",
    "SOA",
    "SADU",
    "SDCA",
    "SIR",
    "SCL",
    "Admissions And marketing",
    "Registrer",
    "Administrations",
    "QEC",
    "Students Affair",
    "Examination",
    "Library",
    "Center for Wellbeing",
    "Supply Chain",
    "Utilities & Maintenance",
    "Vice Chancellor Office",
    "ERP",
    "Soft Skill"
  ];
  const [chatMode, setChatMode] = useState<'public' | 'it-help' | 'private' | 'department'>('public');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('IT');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    name: '',
    email: '',
    password: 'password123',
    department: 'IT',
    customDepartment: '',
    isCustomDept: false,
    designation: '',
    role: 'user' as UserProfile['role'],
    status: 'active' as 'active' | 'pending' | 'blocked'
  });
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState('');
  const [newMsgNotification, setNewMsgNotification] = useState<{ sender: string, text: string } | null>(null);
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileChatListVisible, setIsMobileChatListVisible] = useState(true);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getCachedData('it_notifications'));
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  // LocalStorage syncing effects
  useEffect(() => {
    if (user) {
      setCachedData('it_tickets', tickets, user.uid);
    }
  }, [tickets, user]);

  useEffect(() => {
    if (user) {
      setCachedData('it_users', allUsers, user.uid);
    }
  }, [allUsers, user]);

  useEffect(() => {
    if (user) {
      setCachedData('it_allMessages', allMessages, user.uid);
    }
  }, [allMessages, user]);

  useEffect(() => {
    if (user) {
      setCachedData('it_notifications', notifications, user.uid);
    }
  }, [notifications, user]);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileFormData, setProfileFormData] = useState({ name: '', department: '', designation: '', profileImg: '' });
  const profileFileInputRef = React.useRef<HTMLInputElement>(null);

  // Login/Signup State
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [signupData, setSignupData] = useState({ 
    name: '', 
    email: '', 
    department: '', 
    customDepartment: '',
    isCustomDept: false,
    designation: '', 
    password: '' 
  });
  const [authError, setAuthError] = useState('');
  const [resettingUserPassword, setResettingUserPassword] = useState<UserProfile | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');

  // Form State
  const [newTicket, setNewTicket] = useState({ 
    title: '', 
    category: CATEGORIES[0],
    description: '', 
    priority: 'medium' as const,
    attachment: null as { name: string, data: string } | null
  });

  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // PWA Install Prompt Logic
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Check if on mobile and not installed
    const checkIsMobileAndStandalone = () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      
      if (isMobile && !isStandalone) {
        setShowInstallPrompt(true);
      } else {
        setShowInstallPrompt(false);
      }
    };

    checkIsMobileAndStandalone();
    window.addEventListener('resize', checkIsMobileAndStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('resize', checkIsMobileAndStandalone);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallPrompt(false);
        setDeferredPrompt(null);
      }
    } else {
      alert('To install, open your browser menu and tap "Add to Home Screen" or "Install App".');
    }
  };

  // Data Fetching
  useEffect(() => {
    if (!user) {
      setTickets([]);
      return;
    }
    const perms = getUserPermissions(user);
    let q;
    if (perms.canViewAllTickets) {
      q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc')); // Fetch all for IT/Admin, order by newest
    } else {
      q = query(collection(db, 'tickets'), where('createdBy', '==', user.uid));
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupportTicket));
      setTickets(ticketsData);
    }, (error) => {
      console.warn("Firestore tickets sync error (falling back to cache):", error);
      const cached = getCachedData('it_tickets');
      if (cached && cached.length > 0) {
        setTickets(cached);
      } else {
        setTickets(perms.canViewAllTickets 
          ? (DEFAULT_TICKETS as unknown as SupportTicket[]) 
          : (DEFAULT_TICKETS as unknown as SupportTicket[]).filter(t => t.createdBy === user.uid)
        );
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      let baseList = DEFAULT_EMPLOYEES as unknown as UserProfile[];
      try {
        const customUsers: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
        if (customUsers.length > 0) {
          const baseEmails = new Set(baseList.map(u => u.email.toLowerCase()));
          const extra = customUsers.filter(u => !baseEmails.has(u.email.toLowerCase()));
          baseList = [...extra, ...baseList];
        }
      } catch (e) {}
      setAllUsers(baseList);
      return;
    }
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      try {
        const customUsers: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
        if (customUsers.length > 0) {
          const fsEmails = new Set(usersData.map(u => u.email.toLowerCase()));
          const extra = customUsers.filter(u => !fsEmails.has(u.email.toLowerCase()));
          usersData = [...extra, ...usersData];
        }
      } catch (e) {
        console.warn("Error merging custom users:", e);
      }
      if (usersData.length > 0) {
        setAllUsers(usersData);
      }
    }, (error) => {
      console.warn("Firestore users sync error (using default employees list):", error);
      const cached = getCachedData('it_users');
      let fallbackList = (cached && cached.length > 0) ? cached : (DEFAULT_EMPLOYEES as unknown as UserProfile[]);
      try {
        const customUsers: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
        if (customUsers.length > 0) {
          const fbEmails = new Set(fallbackList.map(u => u.email.toLowerCase()));
          const extra = customUsers.filter(u => !fbEmails.has(u.email.toLowerCase()));
          fallbackList = [...extra, ...fallbackList];
        }
      } catch (e) {}
      setAllUsers(fallbackList);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAllMessages([]);
      return;
    }
    const q = query(collection(db, 'messages'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setAllMessages(msgsData.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    }, (error) => {
      console.warn("Firestore messages sync error (using cache):", error);
      const cached = getCachedData('it_allMessages');
      if (cached && cached.length > 0) {
        setAllMessages(cached);
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || allMessages.length === 0) return;
    const lastMsg = allMessages[allMessages.length - 1];
    const isNew = (Date.now() - new Date(lastMsg.createdAt).getTime()) < 5000;
    const isNotMe = lastMsg.senderId !== user.uid;
    const isUnseen = !lastMsg.seenBy.includes(user.uid);
    const isRelevant = !lastMsg.receiverId || lastMsg.receiverId === 'it-help-group' || lastMsg.receiverId === user.uid || lastMsg.receiverId === `dept-${user.department}`;

    if (isNew && isNotMe && isUnseen && isRelevant) {
      setHasUnreadNotification(true);
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log('Audio error', e));
      
      setNewMsgNotification({ sender: lastMsg.senderName, text: lastMsg.text });
      const timer = setTimeout(() => setNewMsgNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [allMessages, user]);

  useEffect(() => {
    if (!user || tickets.length === 0) return;
    const sortedTickets = [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latestTicket = sortedTickets[0];
    const isNew = (Date.now() - new Date(latestTicket.createdAt).getTime()) < 5000;
    const isNotMe = latestTicket.createdBy !== user.uid;
    const canView = getUserPermissions(user).canViewAllTickets || latestTicket.createdBy === user.uid;

    if (isNew && isNotMe && canView) {
      setHasUnreadNotification(true);
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log('Audio error', e));
    }
  }, [tickets, user]);

  // Sync state to URL hash
  useEffect(() => {
    if (!user) return;
    let hash = '';
    if (isMobileMenuOpen) hash = 'menu';
    else if (isCreating) hash = 'new-ticket';
    else if (selectedTicket) hash = `ticket-${selectedTicket.id}`;
    else if (view === 'chat') {
      hash = isMobileChatListVisible ? 'chat-list' : 'chat-detail';
    } else if (view !== 'tickets') {
      hash = view;
    }
    
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash !== hash) {
      if (hash === '') {
        window.history.pushState(null, '', window.location.pathname + window.location.search);
      } else {
        window.history.pushState(null, '', `#${hash}`);
      }
    }
  }, [view, isMobileMenuOpen, isCreating, selectedTicket, isMobileChatListVisible, user]);

  // Sync URL hash to state on back/forward
  useEffect(() => {
    if (!user) return;
    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '');
      
      setIsMobileMenuOpen(hash === 'menu');
      setIsCreating(hash === 'new-ticket');
      
      if (!hash || hash === '') {
        setView('tickets');
        setSelectedTicket(null);
      } else if (hash.startsWith('ticket-')) {
        const ticketId = hash.replace('ticket-', '');
        const ticket = tickets.find(t => t.id === ticketId);
        if (ticket) setSelectedTicket(ticket);
        else setSelectedTicket(null);
        setView('tickets');
      } else if (hash === 'chat-list') {
        setView('chat');
        setIsMobileChatListVisible(true);
        setSelectedTicket(null);
      } else if (hash === 'chat-detail') {
        setView('chat');
        setIsMobileChatListVisible(false);
        setSelectedTicket(null);
      } else if (['reports', 'users', 'user_management'].includes(hash)) {
        setView(hash as any);
        setSelectedTicket(null);
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    if (window.location.hash) {
       handlePopState();
    }
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, tickets]);

  useEffect(() => {
    if (view !== 'chat' || !user) return;
    setTypingUsers([]);
  }, [view, user, chatMode, selectedChatUser]);

  useEffect(() => {
    if (!user) return;
    const filtered = allMessages.filter(msg => {
      if (chatMode === 'public') return !msg.receiverId;
      if (chatMode === 'department') {
        const target = normalizeDept(selectedDepartment);
        return msg.receiverId === `dept-${selectedDepartment}` || 
               normalizeDept(msg.receiverId?.replace('dept-', '')) === target;
      }
      if (chatMode === 'it-help') {
        if (user.role === 'user') {
          return msg.receiverId === 'it-help-group' && (msg.senderId === user.uid || msg.targetUserId === user.uid);
        } else {
          if (!selectedChatUser) return false;
          return msg.receiverId === 'it-help-group' && (msg.senderId === selectedChatUser.uid || msg.targetUserId === selectedChatUser.uid);
        }
      }
      if (chatMode === 'private' && selectedChatUser) {
        return (msg.senderId === user.uid && msg.receiverId === selectedChatUser.uid) ||
               (msg.senderId === selectedChatUser.uid && msg.receiverId === user.uid);
      }
      return false;
    });
    setMessages(filtered);
  }, [allMessages, chatMode, selectedChatUser, selectedDepartment, user]);
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const unseenMessages = messages.filter(m => !m.seenBy.includes(user.uid));
    unseenMessages.forEach(async (msg) => {
      try {
        await updateDoc(doc(db, 'messages', msg.id), { seenBy: [...msg.seenBy, user.uid] });
      } catch (e) { console.log(e); }
    });
  }, [messages, user]);

  // Request Notification Permissions
  useEffect(() => {
    if (user && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user || allMessages.length === 0) return;
    const lastMsg = allMessages[allMessages.length - 1];
    const isNew = (Date.now() - new Date(lastMsg.createdAt).getTime()) < 5000;
    const isNotMe = lastMsg.senderId !== user.uid;
    const isUnseen = !lastMsg.seenBy.includes(user.uid);
    const isRelevant = !lastMsg.receiverId || lastMsg.receiverId === 'it-help-group' || lastMsg.receiverId === user.uid || lastMsg.receiverId === `dept-${user.department}`;

    if (isNew && isNotMe && isUnseen && isRelevant) {
      setHasUnreadNotification(true);
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log('Audio error', e));
      
      const newNotif: AppNotification = {
        id: `notif-${Date.now()}`,
        type: 'message',
        title: `Message from ${lastMsg.senderName}`,
        description: lastMsg.text,
        linkId: lastMsg.senderId,
        isRead: false,
        createdAt: new Date().toISOString()
      };
      setNotifications(prev => [newNotif, ...prev]);

      showNativeNotification(newNotif.title, { body: newNotif.description, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', vibrate: [200, 100, 200] });

      setNewMsgNotification({ sender: lastMsg.senderName, text: lastMsg.text });
      const timer = setTimeout(() => setNewMsgNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [allMessages, user]);

  useEffect(() => {
    if (!user || tickets.length === 0) return;
    const sortedTickets = [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const latestTicket = sortedTickets[0];
    const isNew = (Date.now() - new Date(latestTicket.createdAt).getTime()) < 5000;
    const isNotMe = latestTicket.createdBy !== user.uid;
    const canView = getUserPermissions(user).canViewAllTickets || latestTicket.createdBy === user.uid;

    if (isNew && isNotMe && canView) {
      setHasUnreadNotification(true);
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log('Audio error', e));

      const newNotif: AppNotification = {
        id: `notif-${Date.now()}`,
        type: 'ticket',
        title: `New Ticket: #${latestTicket.id}`,
        description: latestTicket.title,
        linkId: latestTicket.id,
        isRead: false,
        createdAt: new Date().toISOString()
      };
      setNotifications(prev => [newNotif, ...prev]);

      showNativeNotification(newNotif.title, { body: newNotif.description, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png', vibrate: [200, 100, 200] });
    }
  }, [tickets, user]);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoggingIn(true);

    let input = loginData.username.trim().toLowerCase();
    
    // Normalize admin inputs
    if (input === 'admin' || input === 'iac') {
       input = 'admin@iac.edu.pk'; 
    }

    try {
      let authUid: string | null = null;
      try {
        // If logging in as generic admin with 123456, connect to the primary admin account
        const authEmail = (input === 'admin@iac.edu.pk' && (loginData.password === '123456' || loginData.password === 'admin123' || loginData.password === 'admin')) 
          ? 'asad.akmal@iac.edu.pk' 
          : input;
        const userCredential = await signInWithEmailAndPassword(auth, authEmail, '123456');
        authUid = userCredential.user.uid;
      } catch (authErr: any) {
        // Fallback try with user's exact input password
        try {
          const userCredential = await signInWithEmailAndPassword(auth, input, loginData.password);
          authUid = userCredential.user.uid;
        } catch (fallbackErr: any) {
          console.warn("Firebase Auth sign-in failed or user not in Auth:", fallbackErr?.code);
        }
      }

      let foundUser: UserProfile | null = null;

      // 1. If Auth succeeded, try to fetch user profile from Firestore
      if (authUid) {
        try {
          const userDoc = await getDoc(doc(db, 'users', authUid));
          if (userDoc.exists()) {
            foundUser = userDoc.data() as UserProfile;
          }
        } catch (dbErr) {
          console.warn("Firestore profile fetch error (permissions):", dbErr);
        }
      }

      // 2. Check custom created users in persistent local storage
      if (!foundUser) {
        try {
          const customUsers: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
          const matchedCustom = customUsers.find(u => u.email.toLowerCase() === input || (authUid && u.uid === authUid));
          if (matchedCustom) {
            if (authUid || loginData.password === matchedCustom.password || loginData.password === '123456') {
              foundUser = {
                ...matchedCustom,
                uid: authUid || matchedCustom.uid
              };
              // Self-heal: user is logged into Firebase Auth, so request.auth.uid == authUid allows creating their doc
              if (authUid) {
                setDoc(doc(db, 'users', authUid), foundUser).catch(err => console.warn('Self-heal Firestore write error:', err));
              }
            }
          }
        } catch (customErr) {
          console.warn("Custom users lookup error:", customErr);
        }
      }

      // 3. If profile not yet found, search in DEFAULT_EMPLOYEES directory
      if (!foundUser) {
        const matchedEmp = (DEFAULT_EMPLOYEES as unknown as UserProfile[]).find(emp => emp.email.toLowerCase() === input);
        if (matchedEmp) {
          // Allow login if Firebase Auth succeeded OR password is default '123456'
          if (authUid || loginData.password === '123456' || loginData.password === matchedEmp.password) {
            foundUser = {
              ...matchedEmp,
              uid: authUid || matchedEmp.uid
            };
          }
        }
      }

      // 3. Fallback check for admin master credentials if offline
      if (!foundUser && (input === 'admin@iac.edu.pk' || input === 'admin') && 
          (loginData.password === '123456' || loginData.password === 'admin' || loginData.password === 'admin123')) {
        foundUser = {
          uid: 'yorGd6HgefhuJixFgcMqonkxUpn2',
          name: 'Muhammad Asad Akmal (Admin)',
          email: 'asad.akmal@iac.edu.pk',
          department: 'IT',
          designation: 'System Administrator',
          role: 'admin',
          status: 'active',
          firstLoginCompleted: true,
          permissions: DEFAULT_PERMISSIONS.admin
        };
      }

      // 4. Fallback check from Firestore collection if unauthenticated query is ever allowed
      if (!foundUser) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', input));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const oldUserData = querySnapshot.docs[0].data() as UserProfile;
            if (oldUserData.password === loginData.password) {
              foundUser = oldUserData;
            }
          }
        } catch (dbError) {
          // Ignore permission-denied
        }
      }

      if (foundUser) {
        if (foundUser.status === 'pending') {
          setAuthError('Your account is pending admin approval. Please wait for the IT team to activate it.');
          if (authUid) await signOut(auth).catch(() => {});
          return;
        }
        if (foundUser.status === 'blocked') {
          setAuthError('Your account has been blocked. Please contact the IT department.');
          if (authUid) await signOut(auth).catch(() => {});
          return;
        }

        if (!foundUser.firstLoginCompleted) {
          setPendingUser(foundUser);
          setAuthMode('first_login');
          return;
        }

        setUser(foundUser);
        localStorage.setItem('it_user_session', JSON.stringify(foundUser));
        return;
      }

      setAuthError('Invalid username/email or password.');
    } catch (error: any) {
      console.error("Login general error:", error);
      setAuthError('Invalid username/email or password.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const email = signupData.email.trim().toLowerCase();
    if (!email || !signupData.password || !signupData.name.trim()) {
      setAuthError('Please fill in all required fields.');
      return;
    }

    try {
      // 1. Create in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, signupData.password);
      
      const finalDepartment = (signupData.isCustomDept ? signupData.customDepartment?.trim() : signupData.department) || 'General';
      const newUser: UserProfile = {
        uid: userCredential.user.uid, // Use Firebase Auth UID
        name: signupData.name.trim(),
        email: email,
        department: finalDepartment,
        designation: signupData.designation.trim() || 'Staff',
        role: 'user',
        status: 'active', // Active immediately so any user (gmail etc) can log in
        firstLoginCompleted: true,
        permissions: DEFAULT_PERMISSIONS.user,
        password: signupData.password
      };

      // 2. Save to persistent custom users in localStorage
      try {
        const storedCustom: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
        const updatedCustom = [newUser, ...storedCustom.filter(u => u.email.toLowerCase() !== email && u.uid !== newUser.uid)];
        localStorage.setItem('it_custom_users', JSON.stringify(updatedCustom));
      } catch (storageErr) {}

      // 3. Store profile in Firestore
      try {
        await setDoc(doc(db, 'users', newUser.uid), newUser);
      } catch (fsErr) {
        console.warn("Firestore profile save warning:", fsErr);
      }

      setUser(newUser);
      setAllUsers(prev => [newUser, ...prev.filter(u => u.uid !== newUser.uid)]);
      localStorage.setItem('it_user_session', JSON.stringify(newUser));
    } catch (error: any) {
      console.error("Error signing up:", error);
      if (error.code === 'auth/email-already-in-use') {
        setAuthError('Email already registered. Please log in.');
      } else if (error.code === 'auth/weak-password') {
        setAuthError('Password must be at least 6 characters.');
      } else if (error.code === 'auth/invalid-email') {
        setAuthError('Please enter a valid email address.');
      } else {
        setAuthError(error.message || 'Failed to register. Please try again.');
      }
    }
  };

  const handleAdminAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError('');
    if (!newUserData.name.trim() || !newUserData.email.trim() || !newUserData.password.trim()) {
      setAddUserError('Name, email and password are required.');
      return;
    }

    if (newUserData.isCustomDept && !newUserData.customDepartment.trim()) {
      setAddUserError('Please type the custom department name.');
      return;
    }

    const email = newUserData.email.trim().toLowerCase();
    const finalDepartment = (newUserData.isCustomDept 
      ? newUserData.customDepartment.trim() 
      : newUserData.department.trim()) || 'General';

    setAddUserLoading(true);

    try {
      let uid = 'usr_' + Date.now();
      // Try creating in Firebase Auth via REST API so current admin session is NOT interrupted
      try {
        const apiKey = firebaseConfig.apiKey;
        const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            password: newUserData.password,
            returnSecureToken: true
          })
        });
        const data = await res.json();
        if (res.ok && data.localId) {
          uid = data.localId;
        } else if (data.error?.message === 'EMAIL_EXISTS') {
          const existing = allUsers.find(u => u.email.toLowerCase() === email);
          if (existing) uid = existing.uid;
        } else if (data.error?.message) {
          console.warn('Firebase Auth REST signup error:', data.error.message);
          if (data.error.message.includes('WEAK_PASSWORD')) {
            throw new Error('Password must be at least 6 characters.');
          }
          if (data.error.message.includes('INVALID_EMAIL')) {
            throw new Error('Please enter a valid email address.');
          }
        }
      } catch (authErr: any) {
        if (authErr?.message && (authErr.message.includes('characters') || authErr.message.includes('valid email'))) {
          throw authErr;
        }
        console.warn('Firebase Auth REST signup warning:', authErr);
      }

      const role = newUserData.role;
      const newUser: UserProfile = {
        uid,
        name: newUserData.name.trim(),
        email: email,
        department: finalDepartment,
        designation: newUserData.designation.trim() || (role === 'admin' ? 'Administrator' : 'Staff'),
        role: role,
        status: newUserData.status || 'active',
        firstLoginCompleted: true,
        permissions: DEFAULT_PERMISSIONS[role],
        password: newUserData.password
      };

      // 1. Save to persistent custom users in localStorage so user persists permanently
      try {
        const storedCustom: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
        const updatedCustom = [newUser, ...storedCustom.filter(u => u.email.toLowerCase() !== email && u.uid !== newUser.uid)];
        localStorage.setItem('it_custom_users', JSON.stringify(updatedCustom));
      } catch (e) {
        console.warn('Error saving to it_custom_users:', e);
      }

      // 2. Save to Firestore (works directly once rule allows isAdmin(), or self-heals on login)
      try {
        await setDoc(doc(db, 'users', newUser.uid), newUser);
        console.log('Saved newUser to Firestore:', newUser.uid);
      } catch (fsErr) {
        console.warn('Firestore write warning:', fsErr);
      }

      // 3. Update allUsers state immediately
      setAllUsers(prev => {
        const filtered = prev.filter(u => u.email.toLowerCase() !== email && u.uid !== newUser.uid);
        return [newUser, ...filtered];
      });

      // Reset form & close modal
      setIsAddUserModalOpen(false);
      setNewUserData({
        name: '',
        email: '',
        password: 'password123',
        department: 'IT',
        customDepartment: '',
        isCustomDept: false,
        designation: '',
        role: 'user',
        status: 'active'
      });
      alert(`User ${newUser.name} (${newUser.email}) created successfully!`);
    } catch (err: any) {
      console.error('Error adding user:', err);
      setAddUserError(err.message || 'Failed to create user.');
    } finally {
      setAddUserLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      localStorage.removeItem('it_user_session');
      localStorage.removeItem('it_tickets');
      localStorage.removeItem('it_users');
      localStorage.removeItem('it_allMessages');
      localStorage.removeItem('it_notifications');
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  const handleProfileImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('Image size must be less than 1 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileFormData(prev => ({ ...prev, profileImg: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfileUpdates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Optimistic Update: Close modal & apply locally first
    const updatedUser = { ...user, ...profileFormData };
    setUser(updatedUser);
    localStorage.setItem('it_user_session', JSON.stringify(updatedUser));
    setIsEditingProfile(false);
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        name: profileFormData.name,
        department: profileFormData.department,
        designation: profileFormData.designation,
        profileImg: profileFormData.profileImg
      });
    } catch (error) {
      console.error('Error updating profile in background:', error);
      // Optional: you could revert state here if needed
    }
  };

  const openProfileEditor = () => {
    if (user) {
      setProfileFormData({
        name: user.name,
        department: user.department,
        designation: user.designation,
        profileImg: user.profileImg || ''
      });
      setIsEditingProfile(true);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    // Password update logic here
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewTicket({
          ...newTicket,
          attachment: {
            name: file.name,
            data: reader.result as string
          }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const resetPassword = async (userId: string, newPassword: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        password: newPassword,
        mustChangePassword: true,
        firstLoginCompleted: false
      });

      const updatedUsers = allUsers.map(u => u.uid === userId ? {
        ...u,
        password: newPassword,
        mustChangePassword: true,
        firstLoginCompleted: false
      } : u);
      setAllUsers(updatedUsers);
      saveToLocalStorage('it_users', updatedUsers);
      try {
        const storedCustom: UserProfile[] = JSON.parse(localStorage.getItem('it_custom_users') || '[]');
        const updatedCustom = storedCustom.map(u => u.uid === userId ? {
          ...u,
          password: newPassword,
          mustChangePassword: true,
          firstLoginCompleted: false
        } : u);
        localStorage.setItem('it_custom_users', JSON.stringify(updatedCustom));
      } catch (e) {}

      setResettingUserPassword(null);
      setNewPasswordInput('');
    } catch (error) {
      console.error("Error resetting password:", error);
    }
  };

  const saveToLocalStorage = (key: string, data: any) => { };

  useEffect(() => {
    const savedUser = localStorage.getItem('it_user_session');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {}
    }
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    setLoading(false);
  }, []);
  const handleAskAI = async () => { };
  const handleChangePassword = async (e: React.FormEvent, newPass: string) => {
    e.preventDefault();
    const targetUser = resettingUser || pendingUser || user;
    if (!targetUser) return;
    
    try {
      if (auth.currentUser && auth.currentUser.uid === targetUser.uid) {
        await updatePassword(auth.currentUser, newPass);
      }

      await updateDoc(doc(db, 'users', targetUser.uid), {
        firstLoginCompleted: true,
        password: newPass
      });

      const updatedUsers = allUsers.map(u => u.uid === targetUser.uid ? {
        ...u,
        firstLoginCompleted: true,
        password: newPass
      } : u);
      setAllUsers(updatedUsers);

      setResettingUser(null);
      setPendingUser(null);
      setAuthMode('login');
      alert('Password changed successfully! Please login with your new password.');
      handleLogout();
    } catch (error) {
      console.error("Error changing password:", error);
      alert("Failed to change password. Make sure it's at least 6 characters long.");
    }
  };

  const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const ticketData: SupportTicket = {
      title: newTicket.title,
      category: newTicket.category,
      description: newTicket.description,
      priority: newTicket.priority,
      id: `ticket-${Date.now()}`,
      status: 'open',
      createdBy: user.uid,
      creatorName: user.name,
      department: user.department,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIsCreating(false);
    setNewTicket({ title: '', category: CATEGORIES[0], description: '', priority: 'medium', attachment: null });
    setTickets(prev => [ticketData, ...prev]);
    
    try {
      await setDoc(doc(db, 'tickets', ticketData.id), ticketData);
    } catch (error) {
      console.error("Error creating ticket:", error);
    }
  };

  const resolveTicket = async (ticketId: string, comment: string) => {
    if (!user) return;
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const updatedTicket = {
        ...ticket,
        status: 'resolved' as const,
        resolvedBy: user.uid,
        resolvedByName: user.name,
        resolvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolutionComment: comment
      };
      setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
    } catch (error) {
      console.error("Error resolving ticket:", error);
    }
  };

  const closeTicket = async (ticketId: string, comment: string) => {
    if (!user) return;
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const updatedTicket = {
        ...ticket,
        status: 'closed' as const,
        closedBy: user.uid,
        closedByName: user.name,
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolutionComment: comment
      };
      setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
    } catch (error) {
      console.error("Error closing ticket:", error);
    }
  };

  const updateUserRole = async (userId: string, role: UserProfile['role']) => {
    try {
      const u = allUsers.find(user => user.uid === userId);
      if(!u) return;
      const updatedUser = { ...u, role, permissions: DEFAULT_PERMISSIONS[role] };
      setAllUsers(prev => prev.map(user => user.uid === userId ? updatedUser : user));
      await setDoc(doc(db, 'users', userId), updatedUser);
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  const updateUserStatus = async (userId: string, status: 'pending' | 'active' | 'blocked') => {
    try {
      const u = allUsers.find(user => user.uid === userId);
      if(!u) return;
      const updatedUser = { ...u, status };
      setAllUsers(prev => prev.map(user => user.uid === userId ? updatedUser : user));
      await setDoc(doc(db, 'users', userId), updatedUser);
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const updateUserPermission = async (userId: string, permission: keyof UserPermissions, value: boolean) => {
    try {
      const u = allUsers.find(user => user.uid === userId);
      if(!u) return;
      const currentPerms = getUserPermissions(u);
      const updatedUser = { ...u, permissions: { ...currentPerms, [permission]: value } };
      setAllUsers(prev => prev.map(user => user.uid === userId ? updatedUser : user));
      await setDoc(doc(db, 'users', userId), updatedUser);
    } catch (error) {
      console.error("Error updating permission:", error);
    }
  };

  const assignTicket = async (ticketId: string, itMemberId: string) => {
    const itMember = allUsers.find(u => u.uid === itMemberId);
    if (!itMember) return;

    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const updatedTicket = {
        ...ticket,
        status: 'in-progress' as const,
        assignedTo: itMember.uid,
        assignedToName: itMember.name,
        updatedAt: new Date().toISOString()
      };
      setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
    } catch (error) {
      console.error("Error assigning ticket:", error);
    }
  };

  const submitFeedback = async (ticketId: string, feedback: string) => {
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const updatedTicket = {
        ...ticket,
        feedback,
        updatedAt: new Date().toISOString()
      };
      setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
      setSelectedTicket(null);
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  const reopenTicket = async (ticketId: string) => {
    if (!user) return;
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const newStatus = ticket.assignedTo ? 'in-progress' as const : 'open' as const;
      const updatedTicket = {
        ...ticket,
        status: newStatus,
        resolvedBy: undefined,
        resolvedByName: undefined,
        resolvedAt: undefined,
        closedBy: undefined,
        closedByName: undefined,
        closedAt: undefined,
        updatedAt: new Date().toISOString(),
        resolutionComment: undefined
      };
      setTickets(prev => prev.map(t => t.id === ticketId ? updatedTicket : t));
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
    } catch (error) {
      console.error("Error reopening ticket:", error);
    }
  };

  const sendChatMessage = async () => {
    if (!user || !chatInput.trim()) return;
    
    const textToSend = chatInput;
    setChatInput(''); // Clear immediately for snappy UI
    
    try {
      if (editingMessageId) {
        const msg = allMessages.find(m => m.id === editingMessageId);
        if (msg) {
          const updatedMsg = { ...msg, text: textToSend, updatedAt: new Date().toISOString(), isEdited: true };
          setAllMessages(prev => prev.map(m => m.id === editingMessageId ? updatedMsg : m));
          await setDoc(doc(db, 'messages', editingMessageId), updatedMsg);
        }
        setEditingMessageId(null);
      } else {
        let receiverId = undefined;
        let targetUserId = undefined;
        if (chatMode === 'it-help') {
          receiverId = 'it-help-group';
          targetUserId = user.role === 'user' ? user.uid : (selectedChatUser?.uid || undefined);
        } else if (chatMode === 'private') {
          receiverId = selectedChatUser?.uid || undefined;
        } else if (chatMode === 'department') {
          receiverId = `dept-${selectedDepartment}`;
        }
        const newMsg: any = {
          id: `msg-${Date.now()}`,
          text: textToSend,
          senderId: user.uid,
          senderName: user.name,
          senderRole: user.role,
          createdAt: new Date().toISOString(),
          seenBy: [user.uid]
        };
        if (receiverId) newMsg.receiverId = receiverId;
        if (targetUserId) newMsg.targetUserId = targetUserId;
        setAllMessages(prev => [...prev, newMsg]);
        await setDoc(doc(db, 'messages', newMsg.id), newMsg);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setChatInput(textToSend); // Restore on error
    }
  };

  const deleteChatMessage = async (id: string) => {
    try {
      setAllMessages(prev => prev.filter(m => m.id !== id));
      await deleteDoc(doc(db, 'messages', id));
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const updateTypingStatus = async (isTyping: boolean) => {
    // No-op for localStorage version as we only have one user viewing the app at a time
  };

  const exportToExcel = () => {
    const filteredTickets = getFilteredReportTickets();
    const data = filteredTickets.map(t => ({
      'Ticket ID': t.id,
      'Title': t.title,
      'Category': t.category,
      'Status': t.status,
      'Priority': t.priority,
      'Department': t.department,
      'Created By': t.creatorName,
      'Created At': new Date(t.createdAt).toLocaleString(),
      'Assigned To': t.assignedToName || 'Unassigned',
      'Resolved By': t.resolvedByName || 'N/A',
      'Resolved At': t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : 'N/A',
      'Closed By': t.closedByName || 'N/A',
      'Closed At': t.closedAt ? new Date(t.closedAt).toLocaleString() : 'N/A',
      'Feedback': t.feedback || 'No feedback'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tickets Report");
    XLSX.writeFile(workbook, `IT_Support_Report_${reportFilter}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getFilteredReportTickets = () => {
    const now = new Date();
    return tickets.filter(t => {
      const ticketDate = new Date(t.createdAt);
      if (reportFilter === 'daily') {
        return ticketDate.toDateString() === now.toDateString();
      } else if (reportFilter === 'weekly') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return ticketDate >= weekAgo;
      } else if (reportFilter === 'monthly') {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return ticketDate >= monthAgo;
      }
      return true;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (showInstallPrompt) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-6 text-center">
        <div className="w-32 h-32 mb-6 bg-white p-4 rounded-3xl shadow-xl flex items-center justify-center">
           <img src="/pwa-512x512.png" alt="App Logo" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Install IT Support App</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-sm">
          For the best experience and notifications on your mobile device, please install our app. You must install the app to proceed.
        </p>
        <button 
          onClick={handleInstallClick}
          className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 active:scale-95 transition-all w-full max-w-sm flex items-center justify-center gap-2"
        >
          <Download className="w-6 h-6" /> Install App Now
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-4 relative overflow-hidden">
        {/* Video Background */}
        <video 
          autoPlay 
          muted 
          loop 
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover z-0"
        >
          <source src="/img/bg.mp4" type="video/mp4" />
        </video>
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/50 z-0"></div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white/10 dark:bg-slate-900/20 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/20 dark:border-slate-700/30 relative z-10"
        >
          <div className="w-36 h-auto mx-auto mb-6 flex items-center justify-center">
            <img src="/img/logo.png" alt="IAC Logo" className="max-w-full h-auto object-contain drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-bold text-center text-white drop-shadow-md mb-2">IT Support</h1>
          <p className="text-white/80 font-medium text-center mb-8">
            {authMode === 'first_login' ? 'Welcome to IAC Ticketing System' : authMode === 'login' ? 'Login to your account' : 'Create your account'}
          </p>
          
          {authMode === 'first_login' ? (
            <div className="space-y-4">
              <div className="p-4 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl mb-4">
                <p className="text-sm text-white font-medium text-center leading-relaxed drop-shadow-sm">
                  As this is your first time logging in, would you like to change your default password?
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button 
                  onClick={() => setAuthMode('change_password')}
                  className="btn-primary flex-1 py-3 bg-white text-emerald-600 hover:bg-slate-50 shadow-lg border-none"
                >
                  Change Password
                </button>
                <button 
                  onClick={async () => {
                    try {
                      if (!pendingUser) return;
                      await updateDoc(doc(db, 'users', pendingUser.uid), {
                        firstLoginCompleted: true
                      });
                      const updatedUser = { ...pendingUser, firstLoginCompleted: true };
                      setUser(updatedUser);
                      localStorage.setItem('it_user_session', JSON.stringify(updatedUser));
                    } catch (err) {
                      console.error("Failed to mark first login", err);
                    }
                  }}
                  className="btn-secondary flex-1 py-3 bg-slate-800/40 text-white border-white/20 hover:bg-slate-800/60 shadow-lg"
                >
                  Keep Default
                </button>
              </div>
            </div>
          ) : authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Email / Username</label>
                <input 
                  type="text"
                  className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                  placeholder="Enter email"
                  value={loginData.username || ''}
                  onChange={e => setLoginData({...loginData, username: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Password</label>
                <input 
                  type="password"
                  className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                  placeholder="Enter password"
                  value={loginData.password || ''}
                  onChange={e => setLoginData({...loginData, password: e.target.value})}
                  required
                />
              </div>

              {authError && (
                <div className="p-3 bg-rose-50 text-rose-600 text-xs rounded-lg border border-rose-100">
                  {authError}
                </div>
              )}

              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
              <p className="text-center text-sm text-white/90 font-medium mt-4">
                Don't have an account? <button type="button" onClick={() => setAuthMode('signup')} className="text-white font-bold hover:underline drop-shadow-sm">Sign Up</button>
              </p>
            </form>
          ) : authMode === 'signup' ? (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Full Name</label>
                <input 
                  type="text"
                  className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                  placeholder="Enter your name"
                  value={signupData.name || ''}
                  onChange={e => setSignupData({...signupData, name: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Email Address</label>
                <input 
                  type="email"
                  className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                  placeholder="e.g. user@gmail.com, name@iac.edu.pk"
                  value={signupData.email || ''}
                  onChange={e => setSignupData({...signupData, email: e.target.value})}
                  required
                />
                <p className="mt-1 text-[10px] text-white/70 italic">Any email address is supported (Gmail, Outlook, Yahoo, etc.)</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Department</label>
                  <select 
                    className="input bg-white/10 text-white border-white/20 [&>option]:text-slate-900"
                    value={signupData.isCustomDept ? '__custom__' : (signupData.department || '')}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setSignupData(p => ({ ...p, isCustomDept: true }));
                      } else {
                        setSignupData(p => ({ ...p, department: e.target.value, isCustomDept: false }));
                      }
                    }}
                    required
                  >
                    <option value="" disabled>Select Department</option>
                    {Array.from(new Set([...DEPARTMENTS, ...allUsers.map(u => u.department?.trim()).filter(Boolean)])).map(d => (
                      <option key={d} value={d}>{DEPT_LABELS[d] || d}</option>
                    ))}
                    <option value="__custom__">➕ Type Custom Department...</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Designation</label>
                  <input 
                    type="text"
                    className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                    placeholder="e.g. Manager / Lecturer"
                    value={signupData.designation || ''}
                    onChange={e => setSignupData({...signupData, designation: e.target.value})}
                    required
                  />
                </div>
              </div>

              {signupData.isCustomDept && (
                <div>
                  <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Enter Department Name *</label>
                  <input 
                    type="text"
                    className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                    placeholder="Type department name..."
                    value={signupData.customDepartment || ''}
                    onChange={e => setSignupData(p => ({ ...p, customDepartment: e.target.value }))}
                    required
                    autoFocus
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">Password</label>
                <input 
                  type="password"
                  className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                  placeholder="Create password"
                  value={signupData.password || ''}
                  onChange={e => setSignupData({...signupData, password: e.target.value})}
                  required
                />
              </div>

              {authError && (
                <div className="p-3 bg-rose-50 text-rose-600 text-xs rounded-lg border border-rose-100">
                  {authError}
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-lg active:scale-[0.98]"
              >
                Create Account
              </button>
              <p className="text-center text-sm text-white/90 font-medium mt-4">
                Already have an account? <button type="button" onClick={() => setAuthMode('login')} className="text-white font-bold hover:underline drop-shadow-sm">Sign In</button>
              </p>
            </form>
          ) : (
            <form onSubmit={(e) => {
              handleChangePassword(e, forcedNewPassword);
              setForcedNewPassword('');
            }} className="space-y-4">
              <div className="p-4 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl mb-4">
                <p className="text-sm text-white font-medium text-center leading-relaxed drop-shadow-sm">
                  Please set a new password to continue.
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-white drop-shadow-sm mb-1">New Password</label>
                <input 
                  type="password"
                  className="input bg-white/10 text-white placeholder-white/60 border-white/20"
                  placeholder="Enter new password"
                  value={forcedNewPassword || ''}
                  onChange={e => setForcedNewPassword(e.target.value)}
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-white text-emerald-600 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-[0.98]"
              >
                Update Password & Login
              </button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  const userTickets = getUserPermissions(user).canViewAllTickets ? tickets : tickets.filter(t => t.createdBy === user.uid);
  
  const filteredTickets = userTickets.filter(t => {
    const statusMatch = filter === 'all' || t.status === filter;
    const deptMatch = deptFilter === 'all' || t.department === deptFilter;
    const priorityMatch = priorityFilter === 'all' || t.priority === priorityFilter;
    const categoryMatch = categoryFilter === 'all' || t.category === categoryFilter;
    const assignedMatch = assignedFilter === 'all' || (assignedFilter === 'unassigned' ? !t.assignedTo : t.assignedTo === assignedFilter);
    
    const searchLower = searchQuery.toLowerCase();
    const searchMatch = !searchQuery || 
      t.id.toLowerCase().includes(searchLower) || 
      t.title.toLowerCase().includes(searchLower);

    const ticketDate = new Date(t.createdAt).getTime();
    const startMatch = !dateFilter.start || ticketDate >= new Date(dateFilter.start).getTime();
    const endMatch = !dateFilter.end || ticketDate <= new Date(dateFilter.end + 'T23:59:59').getTime();

    return statusMatch && deptMatch && priorityMatch && categoryMatch && assignedMatch && searchMatch && startMatch && endMatch;
  });

  const filteredUsersList = allUsers.filter(u => 
    !userSearchQuery || 
    (u.name || '').toLowerCase().includes(userSearchQuery.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    (u.department || '').toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const departments = Array.from(new Set(tickets.map(t => t.department)));

  const stats = {
    total: userTickets.length,
    open: userTickets.filter(t => t.status === 'open').length,
    inProgress: userTickets.filter(t => t.status === 'in-progress').length,
    resolved: userTickets.filter(t => t.status === 'resolved').length,
    closed: userTickets.filter(t => t.status === 'closed').length,
  };

  // Analytics Data
  const getAnalyticsData = (dataToAnalyze = userTickets) => {
    // Daily Stats (Last 7 days)
    const dailyData: any[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = dataToAnalyze.filter(t => t.createdAt.startsWith(dateStr)).length;
      dailyData.push({ name: dateStr, count });
    }

    // Category Stats
    const categoryCounts: any = {};
    dataToAnalyze.forEach(t => {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    });
    const categoryData = Object.keys(categoryCounts).map(cat => ({ name: cat, count: categoryCounts[cat] }));
    categoryData.sort((a, b) => b.count - a.count);

    // User Stats (Top Requestors)
    const userCounts: any = {};
    dataToAnalyze.forEach(t => {
      userCounts[t.createdByName] = (userCounts[t.createdByName] || 0) + 1;
    });
    const userData = Object.keys(userCounts).map(userName => ({ name: userName, count: userCounts[userName] }));
    userData.sort((a, b) => b.count - a.count);

    // Department Stats
    const deptCounts: any = {};
    dataToAnalyze.forEach(t => {
      deptCounts[t.department] = (deptCounts[t.department] || 0) + 1;
    });
    const deptData = Object.keys(deptCounts).map(dept => ({ name: dept, count: deptCounts[dept] }));

    // Agent Resolution Stats (Top Performers)
    const agentCounts: any = {};
    dataToAnalyze.forEach(t => {
      if (t.resolvedByName) {
        agentCounts[t.resolvedByName] = (agentCounts[t.resolvedByName] || 0) + 1;
      }
    });
    const agentData = Object.keys(agentCounts).map(agent => ({ name: agent, count: agentCounts[agent] }));
    agentData.sort((a, b) => b.count - a.count);

    // Monthly Stats (Last 6 months)
    const monthlyData: any[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStr = d.toLocaleString('default', { month: 'short' });
      const yearStr = d.getFullYear();
      const count = dataToAnalyze.filter(t => {
        const tDate = new Date(t.createdAt);
        return tDate.getMonth() === d.getMonth() && tDate.getFullYear() === d.getFullYear();
      }).length;
      monthlyData.push({ name: `${monthStr} ${yearStr}`, count });
    }

    return { dailyData, categoryData, deptData, monthlyData, agentData, userData };
  };

  const reportData = getFilteredReportTickets();
  const reportAnalytics = getAnalyticsData(reportData);
  const analytics = getAnalyticsData();
  const COLORS = ['#2563eb', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#8b5cf6', '#f43f5e'];

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-900 flex">
      {/* Sidebar */}
      <aside className={cn(
        "w-64 bg-[#021024] border-r border-[#021024] flex-col sticky top-0 h-[100dvh] z-40 transition-transform relative overflow-hidden",
        isMobileMenuOpen ? "flex fixed inset-y-0 left-0" : "hidden md:flex"
      )}>
        {/* Background Image */}
        <div className="absolute inset-0 pointer-events-none z-0">
          <img src="/img/sidebar-bg.jpg" alt="IAC Building" className="w-full h-full object-cover opacity-15 mix-blend-luminosity grayscale" />
        </div>

        <div className="p-6 border-b border-white/10 flex flex-col items-center justify-center gap-3 relative z-10">
          <button 
            className="absolute top-4 right-4 md:hidden p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-24 h-auto flex items-center justify-center overflow-hidden">
            <img src="/img/logo.png" alt="IAC Logo" className="w-full h-auto object-contain drop-shadow-sm" />
          </div>
          <h1 className="font-bold text-white leading-tight text-lg text-center">IT Support</h1>
        </div>

        <nav className="flex-1 px-4 py-2 flex flex-col gap-1 relative z-10">
          <button
            onClick={() => {
              setView('tickets');
              setIsMobileMenuOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all",
              view === 'tickets' ? "bg-blue-600 text-white shadow-md shadow-blue-900/50" : "text-slate-300 hover:bg-white/10 hover:text-white"
            )}
          >
            <LayoutDashboard className="w-5 h-5" /> All Tickets
          </button>

          <button
            onClick={() => {
              setView('chat');
              setIsMobileChatListVisible(true);
              setIsMobileMenuOpen(false);
            }}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all",
              view === 'chat' ? "bg-blue-600 text-white shadow-md shadow-blue-900/50" : "text-slate-300 hover:bg-white/10 hover:text-white"
            )}
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" /> Chat & Discussion
            </div>
            {allMessages.filter(m => 
              m.senderId !== user?.uid && 
              !m.seenBy.includes(user?.uid || '') &&
              (!m.receiverId || m.receiverId === 'it-help-group' || m.receiverId === user?.uid || m.receiverId === `dept-${user?.department}`)
            ).length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-bounce">
                {allMessages.filter(m => 
                  m.senderId !== user?.uid && 
                  !m.seenBy.includes(user?.uid || '') &&
                  (!m.receiverId || m.receiverId === 'it-help-group' || m.receiverId === user?.uid || m.receiverId === `dept-${user?.department}`)
                ).length}
              </span>
            )}
          </button>
          
          {getUserPermissions(user).canManageUsers && (
            <>
              <button
                onClick={() => {
                  setView('users');
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  view === 'users' ? "bg-blue-600 text-white shadow-md shadow-blue-900/50" : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <UserPlus className="w-5 h-5" /> User Access Management
              </button>
              <button
                onClick={() => {
                  setView('user_management');
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all",
                  view === 'user_management' ? "bg-blue-600 text-white shadow-md shadow-blue-900/50" : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <User className="w-5 h-5" /> All Users
              </button>
            </>
          )}
          {getUserPermissions(user).canViewReports && (
            <button
              onClick={() => {
                setView('reports');
                setIsMobileMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all",
                view === 'reports' ? "bg-blue-600 text-white shadow-md shadow-blue-900/50" : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <BarChart3 className="w-5 h-5" /> Analytics
            </button>
          )}
          <button
            onClick={() => {
              setDarkMode(!darkMode);
              if (!darkMode) {
                document.documentElement.classList.add('dark');
                localStorage.setItem('theme', 'dark');
              } else {
                document.documentElement.classList.remove('dark');
                localStorage.setItem('theme', 'light');
              }
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all text-slate-300 hover:bg-white/10 hover:text-white mt-auto"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />} Theme
          </button>
        </nav>

        <div className="p-4 border-t border-white/10 relative z-10">
          <div className="flex items-center gap-3 p-2 bg-white/5 hover:bg-white/10 transition-all cursor-pointer rounded-lg mb-2 group relative">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold overflow-hidden shrink-0">
              {user.profileImg ? (
                <img src={user.profileImg} alt="profile" className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate pr-6">{user.name}</p>
              <p className="text-[10px] text-blue-200 truncate">{user.designation} | {user.role.toUpperCase()}</p>
            </div>
            <button onClick={openProfileEditor} className="absolute right-2 text-white/50 hover:text-white transition-colors md:opacity-0 md:group-hover:opacity-100 p-2" title="Edit Profile">
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600 px-4 md:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">
                {view === 'tickets' ? 'Tickets Dashboard' : view === 'users' ? 'User Management' : 'Reports & Analytics'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Overview & Management</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
            <div className="relative">
              <button 
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setHasUnreadNotification(false);
                }}
                className="relative p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                <Bell className="w-6 h-6" />
                {hasUnreadNotification && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 border-2 border-white dark:border-slate-800 rounded-full animate-pulse"></span>
                )}
              </button>
              
              {isNotificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsNotificationsOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 dark:text-white">Notifications</h3>
                      <button onClick={() => setNotifications([])} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear All</button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">No new notifications</div>
                      ) : (
                        notifications.map((notif, idx) => (
                          <div 
                            key={notif.id} 
                            className={`p-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${notif.isRead ? 'opacity-60' : ''}`}
                            onClick={() => {
                              setIsNotificationsOpen(false);
                              setNotifications(prev => prev.map((n, i) => i === idx ? { ...n, isRead: true } : n));
                              if (notif.type === 'ticket') {
                                const ticket = tickets.find(t => t.id === notif.linkId);
                                if (ticket) {
                                  setView('tickets');
                                  setSelectedTicket(ticket);
                                }
                              } else {
                                setView('chat');
                                if (user.role !== 'user') {
                                  const chatUser = allUsers.find(u => u.uid === notif.linkId);
                                  if (chatUser) setSelectedChatUser(chatUser);
                                }
                              }
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${notif.isRead ? 'bg-transparent' : 'bg-blue-500'}`}></div>
                              <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{notif.title}</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{notif.description}</p>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="hidden md:flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-700">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm overflow-hidden shrink-0 relative group cursor-pointer" onClick={openProfileEditor} title="Edit Profile">
                {user.profileImg ? (
                  <img src={user.profileImg} alt="profile" className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0)
                )}
                <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white transition-all">
                  <Edit2 className="w-3 h-3" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900 dark:text-white leading-none">{user.name}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{user.role.toUpperCase()}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="ml-2 p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            <button 
              onClick={() => setIsCreating(true)}
              className="btn-primary flex items-center gap-2 px-6"
            >
              <Plus className="w-5 h-5" /> New Ticket
            </button>
          </div>
        </header>

        <main className="flex-1 h-[100dvh] p-4 md:p-8 overflow-y-auto overflow-x-hidden">
          {view === 'tickets' && (
            <div className="space-y-8">
              {/* Stats Counters */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div 
                  onClick={() => setFilter('all')}
                  className={cn("bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-sm cursor-pointer hover:scale-[1.02] transition-transform", filter === 'all' ? "border-slate-400 dark:border-slate-400 ring-2 ring-slate-200 dark:ring-slate-700" : "border-slate-200 dark:border-slate-600")}
                >
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total Tickets</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
                </div>
                <div 
                  onClick={() => setFilter('open')}
                  className={cn("bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-sm border-l-4 border-l-blue-500 cursor-pointer hover:scale-[1.02] transition-transform", filter === 'open' ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 dark:border-slate-600")}
                >
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Open</p>
                  <p className="text-3xl font-bold text-blue-600">{stats.open}</p>
                </div>
                <div 
                  onClick={() => setFilter('in-progress')}
                  className={cn("bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-sm border-l-4 border-l-amber-500 cursor-pointer hover:scale-[1.02] transition-transform", filter === 'in-progress' ? "border-amber-500 ring-2 ring-amber-500/20" : "border-slate-200 dark:border-slate-600")}
                >
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">In Progress</p>
                  <p className="text-3xl font-bold text-amber-500">{stats.inProgress}</p>
                </div>
                <div 
                  onClick={() => setFilter('resolved')}
                  className={cn("bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-sm border-l-4 border-l-emerald-500 cursor-pointer hover:scale-[1.02] transition-transform", filter === 'resolved' ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-200 dark:border-slate-600")}
                >
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Resolved</p>
                  <p className="text-3xl font-bold text-emerald-500">{stats.resolved}</p>
                </div>
                <div 
                  onClick={() => setFilter('closed')}
                  className={cn("bg-white dark:bg-slate-800 p-6 rounded-2xl border shadow-sm border-l-4 border-l-slate-500 cursor-pointer hover:scale-[1.02] transition-transform", filter === 'closed' ? "border-slate-500 ring-2 ring-slate-500/20" : "border-slate-200 dark:border-slate-600")}
                >
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Closed</p>
                  <p className="text-3xl font-bold text-slate-500 dark:text-slate-400">{stats.closed}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-3">
                  <div className="card space-y-4 sticky top-28">
                    <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Filter className="w-4 h-4" /> Filters
                    </h2>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Search</label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input 
                            type="text"
                            placeholder="ID or Title..."
                            className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchQuery || ''}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Status</label>
                        <div className="space-y-1">
                          {(['all', 'open', 'in-progress', 'resolved', 'closed'] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setFilter(s)}
                              className={cn(
                                "w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all",
                                filter === s ? "bg-blue-50 text-blue-700 font-semibold" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                              )}
                            >
                              {s === 'in-progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      {getUserPermissions(user).canViewAllTickets && (
                        <>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Department</label>
                            <select 
                              className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                              value={deptFilter || 'all'}
                              onChange={(e) => setDeptFilter(e.target.value)}
                            >
                              <option value="all">All Departments</option>
                              {departments.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Assigned To (IT Member)</label>
                            <select 
                              className="w-full text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900"
                              value={assignedFilter || 'all'}
                              onChange={(e) => setAssignedFilter(e.target.value)}
                            >
                              <option value="all">All IT Members</option>
                              <option value="unassigned">Unassigned</option>
                              {allUsers.filter(u => u.role === 'it_member' || u.role === 'admin').map(it => (
                                <option key={it.uid} value={it.uid}>{it.name}</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-9 space-y-4">
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-600">
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Ticket Info</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Priority</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Assigned To</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Created By</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredTickets.map((ticket) => (
                            <tr key={ticket.id} className="hover:bg-slate-50 dark:bg-slate-900/50 transition-colors group">
                              <td className="p-4">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-bold text-blue-600 mb-0.5">#{ticket.id}</span>
                                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{ticket.title}</span>
                                  <span className="text-[10px] text-slate-400 mb-1">{ticket.category}</span>
                                </div>
                              </td>
                              <td className="p-4">
                                <PriorityBadge priority={ticket.priority} />
                              </td>
                              <td className="p-4">
                                <StatusBadge status={ticket.status} />
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  {ticket.assignedToName ? (
                                    <>
                                      <Shield className="w-3.5 h-3.5 text-amber-500" />
                                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{ticket.assignedToName}</span>
                                    </>
                                  ) : (
                                    <span className="text-xs text-slate-400 italic">Unassigned</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col">
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{ticket.creatorName}</span>
                                  <span className="text-[10px] text-slate-400">{ticket.department}</span>
                                </div>
                              </td>
                              <td className="p-4 text-right">
                                <button 
                                  onClick={() => setSelectedTicket(ticket)}
                                  className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all"
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {filteredTickets.length === 0 && (
                      <div className="p-20 text-center text-slate-500 dark:text-slate-400">
                        No tickets found matching your filters.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'users' && getUserPermissions(user).canManageUsers && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">User Access Management</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Manage user roles and IT team permissions</p>
                </div>
                <div className="flex items-center gap-3 flex-1 md:max-w-md justify-end">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search users by name, email or dept..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setAddUserError('');
                      setNewUserData({
                        name: '',
                        email: '',
                        password: 'password123',
                        department: 'IT',
                        customDepartment: '',
                        isCustomDept: false,
                        designation: '',
                        role: 'user',
                        status: 'active'
                      });
                      setIsAddUserModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-blue-500/20 transition-all whitespace-nowrap cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Add User
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Total Users</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">{allUsers.length}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">IT Members</p>
                  <p className="text-3xl font-bold text-blue-600">{allUsers.filter(u => u.role === 'it_member').length}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-sm">
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Admins</p>
                  <p className="text-3xl font-bold text-amber-500">{allUsers.filter(u => u.role === 'admin').length}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-600">
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">User Details</th>
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Role</th>
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-center">View All</th>
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-center">Assign</th>
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-center">Close</th>
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-center">Reports</th>
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-center">Users</th>
                        <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsersList.map((u) => (
                        <tr key={u.uid} className="hover:bg-slate-50 dark:bg-slate-900/50 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-xs">
                                {u.name.charAt(0)}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-900 dark:text-white">{u.name}</span>
                                <span className="text-xs text-slate-400">{u.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                              u.role === 'admin' ? "bg-amber-100 text-amber-700" : 
                              u.role === 'it_member' ? "bg-blue-100 text-blue-700" : 
                              "bg-slate-100 text-slate-700 dark:text-slate-200"
                            )}>
                              {u.role.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500"
                              checked={getUserPermissions(u).canViewAllTickets}
                              onChange={(e) => updateUserPermission(u.uid, 'canViewAllTickets', e.target.checked)}
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500"
                              checked={getUserPermissions(u).canAssignTickets}
                              onChange={(e) => updateUserPermission(u.uid, 'canAssignTickets', e.target.checked)}
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500"
                              checked={getUserPermissions(u).canCloseTickets}
                              onChange={(e) => updateUserPermission(u.uid, 'canCloseTickets', e.target.checked)}
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500"
                              checked={getUserPermissions(u).canViewReports}
                              onChange={(e) => updateUserPermission(u.uid, 'canViewReports', e.target.checked)}
                            />
                          </td>
                          <td className="p-4 text-center">
                            <input 
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-500 text-blue-600 focus:ring-blue-500"
                              checked={getUserPermissions(u).canManageUsers}
                              onChange={(e) => updateUserPermission(u.uid, 'canManageUsers', e.target.checked)}
                            />
                          </td>
                          <td className="p-4 text-right">
                            <select 
                              className="text-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={u.role || 'user'}
                              onChange={(e) => updateUserRole(u.uid, e.target.value as any)}
                            >
                              <option value="user">Regular User</option>
                              <option value="it_member">IT Member</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {view === 'user_management' && getUserPermissions(user).canManageUsers && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">All Registered Users</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">View user passwords and reset access</p>
                </div>
                <div className="flex items-center gap-3 flex-1 md:max-w-md justify-end">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search users by name, email or dept..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>
                  <button 
                    onClick={() => {
                      setAddUserError('');
                      setNewUserData({
                        name: '',
                        email: '',
                        password: 'password123',
                        department: 'IT',
                        customDepartment: '',
                        isCustomDept: false,
                        designation: '',
                        role: 'user',
                        status: 'active'
                      });
                      setIsAddUserModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-md shadow-blue-500/20 transition-all whitespace-nowrap cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Add User
                  </button>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-600">
                      <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">User Details</th>
                      <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Password</th>
                      <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-center">Account Status</th>
                      <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsersList.map((u) => (
                      <tr key={u.uid} className="hover:bg-slate-50 dark:bg-slate-900/50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold text-xs">
                              {u.name.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 dark:text-white">{u.name}</span>
                              <span className="text-xs text-slate-400">{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <code className="bg-slate-100 px-2 py-1 rounded text-xs font-mono text-slate-600 dark:text-slate-300">
                            {u.password}
                          </code>
                        </td>
                        <td className="p-4 text-center">
                          <select 
                            className={cn(
                              "text-[10px] font-bold uppercase p-1 rounded border focus:outline-none focus:ring-2 focus:ring-blue-500",
                              u.status === 'active' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              u.status === 'pending' ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200"
                            )}
                            value={u.status || 'active'}
                            onChange={(e) => updateUserStatus(u.uid, e.target.value as any)}
                          >
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="blocked">Blocked</option>
                          </select>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => {
                              setResettingUserPassword(u);
                              setNewPasswordInput('');
                            }}
                            className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition-all"
                          >
                            Reset Password
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === 'chat' && (
            <div className="h-[calc(100vh-120px)] flex flex-col md:flex-row bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-600 shadow-sm overflow-hidden">
              {/* Chat Sidebar */}
              <div className={cn("w-full md:w-64 md:h-auto border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-700 flex flex-col bg-slate-50 dark:bg-slate-900/50", !isMobileChatListVisible ? "hidden md:flex" : "h-full md:flex")}>
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-blue-600" /> Chats
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  <div className="pb-2 px-1">
                    <div className="relative">
                      <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Search chats & users..." 
                        value={chatUserSearch}
                        onChange={(e) => setChatUserSearch(e.target.value)}
                        className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-blue-500 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {(!chatUserSearch || "public chat everyone can see".includes(chatUserSearch.toLowerCase())) && (
                  <button 
                    onClick={() => {
                      setChatMode('public');
                      setSelectedChatUser(null);
                      setIsMobileChatListVisible(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left relative",
                      chatMode === 'public' ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "text-slate-600 dark:text-slate-300 hover:bg-white dark:bg-slate-800 hover:shadow-sm"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs", chatMode === 'public' ? "bg-blue-500" : "bg-blue-100 text-blue-600")}>
                      P
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">Public Chat</p>
                      <p className={cn("text-[10px] truncate", chatMode === 'public' ? "text-blue-100" : "text-slate-400")}>Everyone can see</p>
                    </div>
                    {allMessages.filter(m => !m.receiverId && m.senderId !== user?.uid && !m.seenBy.includes(user?.uid || '')).length > 0 && (
                      <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full"></div>
                    )}
                  </button>
                  )}
                  {/* Department Groups Section */}
                  {(() => {
                    const isAdmin = user?.role === 'admin';
                    const userDept = normalizeDept(user?.department);
                    const allAvailableDepts = Array.from(new Set([
                      ...DEPARTMENTS,
                      ...allUsers.map(u => normalizeDept(u.department)).filter(Boolean)
                    ]));
                    const visibleDepartments = isAdmin
                      ? allAvailableDepts 
                      : (userDept && userDept !== 'General' ? [userDept] : (user?.department ? [user.department] : []));

                    if (visibleDepartments.length === 0) return null;

                    return (
                      <>
                        <div className="pt-3 pb-1 px-2 flex items-center justify-between">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {isAdmin ? 'Department Groups' : 'My Department Group'}
                          </p>
                          {isAdmin && (
                            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                              {visibleDepartments.length}
                            </span>
                          )}
                        </div>

                        {visibleDepartments
                          .filter(dept => !chatUserSearch || `${dept} ${DEPT_LABELS[dept] || ''} department group`.toLowerCase().includes(chatUserSearch.toLowerCase()))
                          .map(dept => {
                            const isSelected = chatMode === 'department' && selectedDepartment === dept;
                            const deptMembersCount = allUsers.filter(u => normalizeDept(u.department) === dept || (dept === 'IT' && (u.role === 'admin' || u.role === 'it_member'))).length;
                            const unreadCount = allMessages.filter(m => 
                              (m.receiverId === `dept-${dept}` || normalizeDept(m.receiverId?.replace('dept-', '')) === dept) && 
                              m.senderId !== user?.uid && 
                              !m.seenBy.includes(user?.uid || '')
                            ).length;

                            return (
                              <button 
                                key={dept}
                                onClick={() => {
                                  setChatMode('department');
                                  setSelectedDepartment(dept);
                                  setSelectedChatUser(null);
                                  setIsMobileChatListVisible(false);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left relative",
                                  isSelected ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-slate-600 dark:text-slate-300 hover:bg-white dark:bg-slate-800 hover:shadow-sm"
                                )}
                              >
                                <div className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px]", 
                                  isSelected ? "bg-emerald-500 text-white" : "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                                )}>
                                  {dept.slice(0, 3).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-xs font-bold truncate">{DEPT_LABELS[dept] || dept}</p>
                                    {normalizeDept(user?.department) === dept && (
                                      <span className={cn(
                                        "text-[8px] px-1.5 py-0.2 rounded font-semibold whitespace-nowrap", 
                                        isSelected ? "bg-emerald-700 text-emerald-100" : "bg-emerald-50 text-emerald-600 dark:bg-slate-700 dark:text-emerald-400"
                                      )}>
                                        My Dept
                                      </span>
                                    )}
                                  </div>
                                  <p className={cn("text-[10px] truncate", isSelected ? "text-emerald-100" : "text-slate-400")}>
                                    {deptMembersCount > 0 ? `${deptMembersCount} members` : 'Department Group'}
                                  </p>
                                </div>
                                {unreadCount > 0 && (
                                  <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></div>
                                )}
                              </button>
                            );
                        })}
                      </>
                    );
                  })()}

                  {(!chatUserSearch || "it help group support & it members".includes(chatUserSearch.toLowerCase())) && (
                  <button 
                    onClick={() => {
                      setChatMode('it-help');
                      setSelectedChatUser(null);
                      setIsMobileChatListVisible(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left relative",
                      chatMode === 'it-help' ? "bg-amber-600 text-white shadow-md shadow-amber-100" : "text-slate-600 dark:text-slate-300 hover:bg-white dark:bg-slate-800 hover:shadow-sm"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs", chatMode === 'it-help' ? "bg-amber-500" : "bg-amber-100 text-amber-600")}>
                      H
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">IT Help Group</p>
                      <p className={cn("text-[10px] truncate", chatMode === 'it-help' ? "text-amber-100" : "text-slate-400")}>Support & IT Members</p>
                    </div>
                    {allMessages.filter(m => m.receiverId === 'it-help-group' && m.senderId !== user?.uid && !m.seenBy.includes(user?.uid || '')).length > 0 && (
                      <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full"></div>
                    )}
                  </button>
                  )}

                  {/* IT Help Requesters List for IT Members */}
                  {user.role !== 'user' && chatMode === 'it-help' && (
                    <div className="ml-4 mt-1 space-y-1 border-l-2 border-amber-100 pl-2 py-1">
                      {allUsers.filter(u => {
                        const hasMessagedIT = allMessages.some(m => m.receiverId === 'it-help-group' && m.senderId === u.uid);
                        return hasMessagedIT;
                      }).length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic px-2">No requests yet</p>
                      ) : (
                        allUsers.filter(u => allMessages.some(m => m.receiverId === 'it-help-group' && m.senderId === u.uid)).map(requester => (
                          <button 
                            key={requester.uid}
                            onClick={() => {
                              setSelectedChatUser(requester);
                              setIsMobileChatListVisible(false);
                            }}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left",
                              selectedChatUser?.uid === requester.uid ? "bg-amber-100 text-amber-700 font-bold" : "text-slate-500 dark:text-slate-400 hover:bg-amber-50"
                            )}
                          >
                            <div className="w-5 h-5 rounded-full bg-amber-200 flex items-center justify-center text-[8px] font-bold">
                              {requester.name.charAt(0)}
                            </div>
                            <span className="text-[10px] truncate flex-1">{requester.name}</span>
                            {allMessages.filter(m => m.receiverId === 'it-help-group' && m.senderId === requester.uid && !m.seenBy.includes(user?.uid || '')).length > 0 && (
                              <div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  <div className="pt-4 pb-2 px-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Direct Messages</p>
                  </div>

                  {allUsers
                    .filter(u => u.uid !== user?.uid)
                    .filter(u => u.name.toLowerCase().includes(chatUserSearch.toLowerCase()) || u.role.toLowerCase().includes(chatUserSearch.toLowerCase()) || u.department.toLowerCase().includes(chatUserSearch.toLowerCase()))
                    .map(u => (
                    <button 
                      key={u.uid}
                      onClick={() => {
                        setChatMode('private');
                        setSelectedChatUser(u);
                        setIsMobileChatListVisible(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left relative",
                        (chatMode === 'private' && selectedChatUser?.uid === u.uid) ? "bg-blue-600 text-white shadow-md shadow-blue-100" : "text-slate-600 dark:text-slate-300 hover:bg-white dark:bg-slate-800 hover:shadow-sm"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs", (chatMode === 'private' && selectedChatUser?.uid === u.uid) ? "bg-blue-500" : "bg-slate-200 text-slate-600 dark:text-slate-300")}>
                        {u.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{u.name}</p>
                        <p className={cn("text-[10px] truncate", (chatMode === 'private' && selectedChatUser?.uid === u.uid) ? "text-blue-100" : "text-slate-400")}>{u.role.replace('_', ' ')}</p>
                      </div>
                      {allMessages.filter(m => m.senderId === u.uid && m.receiverId === user?.uid && !m.seenBy.includes(user?.uid || '')).length > 0 && (
                        <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full"></div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Area */}
              <div className={cn("flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-800", isMobileChatListVisible ? "hidden md:flex" : "flex")}>
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsMobileChatListVisible(true)} className="md:hidden p-1 mr-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white">
                      <ChevronRight className="w-5 h-5 rotate-180" />
                    </button>
                    <div>
                      <h2 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {chatMode === 'private' && selectedChatUser ? (
                          <>
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                            Chat with {selectedChatUser.name}
                          </>
                        ) : chatMode === 'it-help' ? (
                          <>
                            <Shield className="w-5 h-5 text-amber-600" /> 
                            IT Support {user.role !== 'user' && selectedChatUser ? `for ${selectedChatUser.name}` : ''}
                          </>
                        ) : chatMode === 'department' ? (
                          <>
                            <MessageSquare className="w-5 h-5 text-emerald-600" /> #{DEPT_LABELS[selectedDepartment] || selectedDepartment}
                          </>
                        ) : (
                          <>
                            <MessageSquare className="w-5 h-5 text-blue-600" /> Public Discussion
                          </>
                        )}
                      </h2>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">
                        {chatMode === 'private' && selectedChatUser ? `${selectedChatUser.designation} | ${selectedChatUser.department}` : 
                         chatMode === 'it-help' ? 'Direct Support from IT Team' : 
                         chatMode === 'department' ? `${allUsers.filter(u => normalizeDept(u.department) === selectedDepartment).length} Members • Department Group Discussion` : 'Help & Community Support'}
                      </p>
                    </div>
                  </div>
                  {chatMode !== 'private' && (
                    <div className="flex -space-x-2 overflow-hidden">
                      {allUsers
                        .filter(u => chatMode === 'department' ? normalizeDept(u.department) === selectedDepartment : u.role !== 'user')
                        .slice(0, 5)
                        .map(u => (
                        <div key={u.uid} className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-slate-800 bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300" title={`${u.name} (${u.designation})`}>
                          {u.name.charAt(0)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-900/30">
                  {chatMode === 'it-help' && user.role !== 'user' && !selectedChatUser ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                      <div className="bg-amber-100 p-4 rounded-full">
                        <Shield className="w-8 h-8 text-amber-600" />
                      </div>
                      <p className="text-sm font-medium">Select a help request from the sidebar to start supporting.</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                      <div className="bg-slate-100 p-4 rounded-full">
                        <MessageSquare className="w-8 h-8" />
                      </div>
                      <p className="text-sm font-medium">No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isMe = msg.senderId === user?.uid;
                      const showName = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
                      
                      return (
                        <div key={msg.id} className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                          {showName && (
                            <div className="flex items-center gap-2 mb-1 px-1">
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{msg.senderName}</span>
                              <span className={cn(
                                "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                                msg.senderRole === 'admin' ? "bg-amber-100 text-amber-600" : 
                                msg.senderRole === 'it_member' ? "bg-blue-100 text-blue-600" : 
                                "bg-slate-200 text-slate-600 dark:text-slate-300"
                              )}>
                                {msg.senderRole.replace('_', ' ')}
                              </span>
                            </div>
                          )}
                          <div className={cn(
                            "group relative max-w-[80%] p-3 rounded-2xl text-sm shadow-sm transition-all",
                            isMe ? "bg-blue-600 text-white rounded-tr-none" : "bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-tl-none"
                          )}>
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                            
                            {isMe && (
                              <div className="absolute top-0 right-full mr-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                <button 
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setChatInput(msg.text);
                                  }}
                                  className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-blue-600 rounded-lg shadow-sm"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => deleteChatMessage(msg.id)}
                                  className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-400 hover:text-rose-600 rounded-lg shadow-sm"
                                >
                                  <AlertCircle className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            <div className={cn(
                              "mt-1 flex items-center gap-1.5 text-[9px]",
                              isMe ? "text-blue-100 justify-end" : "text-slate-400"
                            )}>
                              <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              {msg.isEdited && <span className="italic">(edited)</span>}
                              {isMe && (
                                <div className="flex items-center">
                                  <CheckCircle2 className={cn("w-2.5 h-2.5", msg.seenBy.length > 1 ? "text-emerald-300" : "text-blue-200")} />
                                  {msg.seenBy.length > 1 && <CheckCircle2 className="w-2.5 h-2.5 -ml-1 text-emerald-300" />}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {typingUsers.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium italic animate-pulse">
                      <div className="flex gap-1">
                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                      </div>
                      {typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                  {editingMessageId && (
                    <div className="mb-2 flex items-center justify-between bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
                      <span className="text-[10px] font-bold text-blue-600 uppercase">Editing Message</span>
                      <button onClick={() => {
                        setEditingMessageId(null);
                        setChatInput('');
                      }} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:text-slate-300">Cancel</button>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <textarea 
                      className="flex-1 p-3 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                      placeholder={
                        chatMode === 'private' && selectedChatUser ? `Message ${selectedChatUser.name}...` : 
                        chatMode === 'it-help' ? (user.role !== 'user' ? (selectedChatUser ? `Reply to ${selectedChatUser.name}...` : 'Select a request to reply...') : 'Ask IT Team for help...') : 
                        chatMode === 'department' ? `Message in #${selectedDepartment} Group...` :
                        "Type your message here..."
                      }
                      rows={1}
                      value={chatInput}
                      onChange={e => {
                        setChatInput(e.target.value);
                        updateTypingStatus(e.target.value.length > 0);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      disabled={(chatMode === 'private' || (chatMode === 'it-help' && user.role !== 'user')) && !selectedChatUser}
                    />
                    <button 
                      onClick={sendChatMessage}
                      disabled={!chatInput.trim()}
                      className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50 disabled:shadow-none"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === 'reports' && getUserPermissions(user).canViewReports && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">Analytics Overview</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Comprehensive report of IT support activities</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select 
                    value={reportFilter || 'daily'}
                    onChange={(e) => setReportFilter(e.target.value as any)}
                    className="border border-slate-300 dark:border-slate-500 rounded-lg py-1.5 px-2 text-[11px] w-fit focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 transition-all cursor-pointer"
                  >
                    <option value="daily">Today</option>
                    <option value="weekly">Last 7 Days</option>
                    <option value="monthly">Last 30 Days</option>
                    <option value="all">All Time</option>
                  </select>
                  <select 
                    value={reportBreakdown}
                    onChange={(e) => setReportBreakdown(e.target.value as any)}
                    className="border border-slate-300 dark:border-slate-500 rounded-lg py-1.5 px-2 text-[11px] w-fit focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 transition-all cursor-pointer"
                  >
                    <option value="user">User-wise (Top Requestors)</option>
                    <option value="category">Issue-wise (Top Categories)</option>
                    <option value="agent">Agent-wise (Top Resolvers)</option>
                  </select>
                  <button 
                    onClick={exportToExcel}
                    className="btn-primary flex items-center gap-2 py-1.5 px-3 text-[11px]"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Excel
                  </button>
                </div>
              </div>

              {/* Tickets Detail Table */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-blue-600" /> Ticket Details ({getFilteredReportTickets().length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-600">
                        <th className="p-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">ID & Title</th>
                        <th className="p-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Category</th>
                        <th className="p-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                        <th className="p-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Created At</th>
                        <th className="p-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Resolved By</th>
                        <th className="p-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Closed At</th>
                        <th className="p-4 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Closed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {getFilteredReportTickets().length > 0 ? (
                        getFilteredReportTickets().map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50 dark:bg-slate-900/50 transition-colors">
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-mono text-slate-400">#{t.id.slice(-6)}</span>
                                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{t.title}</span>
                              </div>
                            </td>
                            <td className="p-4 text-xs text-slate-600 dark:text-slate-300">{t.category}</td>
                            <td className="p-4">
                              <StatusBadge status={t.status} />
                            </td>
                            <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                              {new Date(t.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="p-4 text-xs text-slate-600 dark:text-slate-300">
                              {t.resolvedByName || <span className="text-slate-300">---</span>}
                            </td>
                            <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                              {t.closedAt ? new Date(t.closedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : <span className="text-slate-300">---</span>}
                            </td>
                            <td className="p-4 text-xs text-slate-600 dark:text-slate-300">
                              {t.closedByName || <span className="text-slate-300">---</span>}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                            No tickets found for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="card space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" /> Daily Tickets (Last 7 Days)
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={reportAnalytics.dailyData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-indigo-600" /> Monthly Trends
                  </h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reportAnalytics.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" fontSize={10} />
                        <YAxis fontSize={10} />
                        <Tooltip />
                        <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card md:col-span-2 space-y-4">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-orange-600" /> 
                    {reportBreakdown === 'user' ? 'Top Requestors (User-wise)' : 
                     reportBreakdown === 'category' ? 'Most Frequent Issues (Issue-wise)' : 
                     'Top Resolvers (Agent-wise)'}
                  </h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={reportBreakdown === 'user' ? reportAnalytics.userData : 
                              reportBreakdown === 'category' ? reportAnalytics.categoryData : 
                              reportAnalytics.agentData} 
                        layout="vertical"
                        margin={{ left: 40, right: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" fontSize={10} />
                        <YAxis dataKey="name" type="category" fontSize={10} width={120} />
                        <Tooltip />
                        <Bar 
                          dataKey="count" 
                          fill={reportBreakdown === 'user' ? '#3b82f6' : reportBreakdown === 'category' ? '#f59e0b' : '#10b981'} 
                          radius={[0, 4, 4, 0]} 
                          label={{ position: 'right', fontSize: 10, fill: '#64748b' }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Ticket Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create New Ticket</h2>
              <form onSubmit={createTicket} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Subject</label>
                    <input 
                      required
                      className="input"
                      placeholder="Brief summary"
                      value={newTicket.title || ''}
                      onChange={e => setNewTicket({...newTicket, title: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Category</label>
                    <select 
                      className="input"
                      value={newTicket.category || CATEGORIES[0]}
                      onChange={e => setNewTicket({...newTicket, category: e.target.value})}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Description / Comment</label>
                    <button 
                      type="button" 
                      onClick={handleAskAI} 
                      disabled={isAiLoading || !newTicket.description}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      {isAiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                      Ask AI for Suggestions
                    </button>
                  </div>
                  <textarea 
                    required
                    rows={3}
                    className="input resize-none"
                    placeholder="Provide details about the problem..."
                    value={newTicket.description || ''}
                    onChange={e => setNewTicket({...newTicket, description: e.target.value})}
                  />
                  {aiSuggestion && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-900">
                      <div className="font-semibold mb-1 flex items-center gap-2">
                        <Shield className="w-4 h-4" /> AI Suggestion:
                      </div>
                      <p>{aiSuggestion}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Priority</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['low', 'medium', 'high'] as const).map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setNewTicket({...newTicket, priority: p})}
                          className={cn(
                            "py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all",
                            newTicket.priority === p 
                              ? "bg-blue-600 text-white border-blue-600 shadow-md" 
                              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Attachment (Optional)</label>
                    <div className="relative group h-[42px]">
                      <input 
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={handleFileChange}
                      />
                      <div className={cn(
                        "absolute inset-0 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 transition-all bg-slate-50 dark:bg-slate-900",
                        newTicket.attachment 
                        ? "border-emerald-200 bg-emerald-50" 
                        : "border-slate-200 dark:border-slate-600 group-hover:border-blue-400"
                      )}>
                        {newTicket.attachment ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="text-[10px] font-bold text-emerald-700 truncate px-2">
                              {newTicket.attachment.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 group-hover:text-blue-600">
                              CLICK TO UPLOAD
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 btn-secondary"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    Submit Ticket
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ticket Details Modal */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTicket(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-2xl bg-white dark:bg-slate-800 h-screen md:h-auto md:max-h-[90vh] md:rounded-2xl shadow-2xl overflow-hidden flex flex-col ml-auto"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <StatusBadge status={selectedTicket.status} />
                  <PriorityBadge priority={selectedTicket.priority} />
                  <span className="text-xs font-bold text-slate-400 uppercase">{selectedTicket.category}</span>
                </div>
                <button 
                  onClick={() => setSelectedTicket(null)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <ChevronRight className="w-6 h-6 rotate-180" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{selectedTicket.title}</h2>
                
                <div className="flex flex-wrap gap-6 mb-8 text-sm text-slate-500 dark:text-slate-400 border-y border-slate-100 dark:border-slate-700 py-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-400 mb-1">Requested By</span>
                    <span className="text-slate-900 dark:text-white font-medium flex items-center gap-2">
                      <User className="w-4 h-4" /> {selectedTicket.creatorName} ({selectedTicket.department})
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-400 mb-1">Created At</span>
                    <span className="text-slate-900 dark:text-white font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4" /> {new Date(selectedTicket.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-slate-400 mb-1">Assigned To</span>
                    {getUserPermissions(user).canAssignTickets ? (
                      <select 
                        className="text-xs p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-amber-600"
                        value={selectedTicket.assignedTo || ''}
                        onChange={(e) => assignTicket(selectedTicket.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {allUsers.filter(u => u.role === 'it_member' || u.role === 'admin').map(it => (
                          <option key={it.uid} value={it.uid}>{it.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-amber-600 font-bold flex items-center gap-2">
                        <Shield className="w-4 h-4" /> {selectedTicket.assignedToName || 'Unassigned'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="prose prose-slate max-w-none mb-10">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Description</h4>
                  <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    {selectedTicket.description}
                  </p>
                </div>

                {selectedTicket.attachment && (
                  <div className="mb-10">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-3">Attachment</h4>
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-600">
                      <div className="bg-blue-100 p-2 rounded">
                        <Plus className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">{selectedTicket.attachment.name}</span>
                      <a 
                        href={selectedTicket.attachment.data} 
                        download={selectedTicket.attachment.name}
                        className="ml-auto text-xs text-blue-600 hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                )}

                {selectedTicket.resolutionComment && (
                  <div className="mb-10 bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Resolution Details
                    </h4>
                    <p className="text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{selectedTicket.resolutionComment}</p>
                  </div>
                )}

                {selectedTicket.status === 'resolved' && (
                  <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl mb-8">
                    <h4 className="text-emerald-800 font-bold flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-5 h-5" /> Issue Resolved
                    </h4>
                    {selectedTicket.feedback ? (
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-emerald-200">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">User Feedback</span>
                        <p className="text-slate-700 dark:text-slate-200 italic">"{selectedTicket.feedback}"</p>
                      </div>
                    ) : (
                      user.uid === selectedTicket.createdBy && (
                        <div className="space-y-3">
                          <p className="text-sm text-emerald-700">How was your experience with this support request?</p>
                          <div className="flex gap-2">
                            <input 
                              className="flex-1 px-4 py-2 rounded-lg border border-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              placeholder="Leave a comment..."
                              value={feedbackText || ''}
                              onChange={e => setFeedbackText(e.target.value)}
                            />
                            <button 
                              onClick={() => {
                                if (feedbackText.trim()) {
                                  submitFeedback(selectedTicket.id, feedbackText);
                                  setFeedbackText('');
                                }
                              }}
                              className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* User Actions (Reopen) */}
              {user.uid === selectedTicket.createdBy && (selectedTicket.status === 'resolved' || selectedTicket.status === 'closed') && (
                <div className="p-6 bg-blue-50 border-t border-blue-100 flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-blue-900 uppercase tracking-wider mb-1">User Actions</h4>
                  <p className="text-xs text-blue-700 mb-2">If your issue is not resolved, you can reopen this ticket.</p>
                  <button 
                    onClick={() => reopenTicket(selectedTicket.id)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    <RefreshCw className="w-5 h-5" /> Reopen Ticket
                  </button>
                </div>
              )}

              {/* IT Team Actions */}
              {(getUserPermissions(user).canAssignTickets || getUserPermissions(user).canCloseTickets) && selectedTicket.status !== 'closed' && (
                <div className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 flex flex-col gap-3">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-1">IT Team Actions</h4>
                  
                  {(selectedTicket.status === 'in-progress' || selectedTicket.status === 'resolved') && (
                    <div className="mb-2">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1">Resolution Comment / Note</label>
                      <textarea 
                        className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="Explain how the issue was resolved..."
                        rows={3}
                        value={resolutionText}
                        onChange={e => setResolutionText(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="flex gap-3">
                    {selectedTicket.status === 'open' && getUserPermissions(user).canAssignTickets && (
                      <div className="flex-1 flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">Assign to Member</span>
                        <select 
                          className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 transition-all shadow-lg shadow-amber-100 px-4 focus:outline-none"
                          value={selectedTicket.assignedTo || ''}
                          onChange={(e) => assignTicket(selectedTicket.id, e.target.value)}
                        >
                          <option value="">Select IT Member...</option>
                          {allUsers.filter(u => u.role === 'it_member' || u.role === 'admin').map(it => (
                            <option key={it.uid} value={it.uid} className="text-slate-900 dark:text-white bg-white dark:bg-slate-800">{it.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selectedTicket.status === 'in-progress' && getUserPermissions(user).canCloseTickets && (
                      <button 
                        onClick={() => {
                          resolveTicket(selectedTicket.id, resolutionText);
                          setResolutionText('');
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                      >
                        <CheckCircle2 className="w-5 h-5" /> Mark as Resolved
                      </button>
                    )}
                    {selectedTicket.status === 'resolved' && getUserPermissions(user).canCloseTickets && (
                      <button 
                        onClick={() => {
                          closeTicket(selectedTicket.id, resolutionText || selectedTicket.resolutionComment || '');
                          setResolutionText('');
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg shadow-slate-100"
                      >
                        <AlertCircle className="w-5 h-5" /> Close Ticket
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reset Password Modal */}
      <AnimatePresence>
        {resettingUserPassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setResettingUserPassword(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Reset Password</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Set a new password for <span className="font-semibold text-slate-900 dark:text-white">{resettingUserPassword.name}</span>.
              </p>
              
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newPasswordInput.trim()) {
                    resetPassword(resettingUserPassword.uid, newPasswordInput);
                  }
                }} 
                className="space-y-5"
              >
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">New Password</label>
                  <input 
                    type="text"
                    required
                    autoFocus
                    className="input"
                    placeholder="Enter custom password..."
                    value={newPasswordInput || ''}
                    onChange={e => setNewPasswordInput(e.target.value)}
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setResettingUserPassword(null)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all shadow-lg shadow-rose-100"
                  >
                    Reset Now
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
        {newMsgNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-4 flex items-center gap-4 max-w-sm cursor-pointer hover:shadow-blue-100 transition-all"
            onClick={() => {
              setView('chat');
              setNewMsgNotification(null);
            }}
          >
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">New Message from {newMsgNotification.sender}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{newMsgNotification.text}</p>
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setNewMsgNotification(null);
              }}
              className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
            >
              <Plus className="w-4 h-4 rotate-45" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isEditingProfile && (
          <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Edit Profile</h3>
                <button onClick={() => setIsEditingProfile(false)} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={saveProfileUpdates} className="p-6 space-y-4">
                <div className="flex justify-center mb-6">
                  <div className="relative group cursor-pointer" onClick={() => profileFileInputRef.current?.click()} title="Change Profile Picture">
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center border-4 border-white dark:border-slate-800 shadow-lg">
                      {profileFormData.profileImg ? (
                        <img src={profileFormData.profileImg} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-10 h-10 text-slate-400" />
                      )}
                    </div>
                    <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                    <input 
                      type="file" 
                      ref={profileFileInputRef} 
                      onChange={handleProfileImageChange} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Full Name</label>
                  <input
                    type="text"
                    required
                    value={profileFormData.name}
                    onChange={e => setProfileFormData(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Designation</label>
                  <input
                    type="text"
                    required
                    value={profileFormData.designation}
                    onChange={e => setProfileFormData(p => ({ ...p, designation: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Department</label>
                  <select
                    required
                    value={profileFormData.department}
                    onChange={e => setProfileFormData(p => ({ ...p, department: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600 rounded-lg transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Admin Add User Modal */}
        {isAddUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-700"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-slate-900 dark:text-white">Add New User</h3>
                </div>
                <button 
                  onClick={() => setIsAddUserModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAdminAddUser} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                {addUserError && (
                  <div className="p-3 bg-rose-50 text-rose-600 text-xs rounded-xl border border-rose-100 dark:bg-rose-950/30 dark:border-rose-900">
                    {addUserError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ali Raza"
                    value={newUserData.name}
                    onChange={e => setNewUserData(p => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. user@gmail.com, name@iac.edu.pk"
                    value={newUserData.email}
                    onChange={e => setNewUserData(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">Any email domain is allowed (Gmail, Outlook, Yahoo, University, etc.)</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Initial Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 characters"
                    value={newUserData.password}
                    onChange={e => setNewUserData(p => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Department</label>
                      <select
                        value={newUserData.isCustomDept ? '__custom__' : newUserData.department}
                        onChange={e => {
                          if (e.target.value === '__custom__') {
                            setNewUserData(p => ({ ...p, isCustomDept: true }));
                          } else {
                            setNewUserData(p => ({ ...p, department: e.target.value, isCustomDept: false }));
                          }
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      >
                        {Array.from(new Set([...DEPARTMENTS, ...allUsers.map(u => u.department?.trim()).filter(Boolean)])).map(d => (
                          <option key={d} value={d}>{DEPT_LABELS[d] || d}</option>
                        ))}
                        <option value="__custom__">➕ Manual / Type Custom Department...</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Designation</label>
                      <input
                        type="text"
                        placeholder="e.g. Lecturer / Manager"
                        value={newUserData.designation}
                        onChange={e => setNewUserData(p => ({ ...p, designation: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                  </div>

                  {newUserData.isCustomDept && (
                    <motion.div 
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-blue-50/80 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800"
                    >
                      <label className="block text-xs font-bold text-blue-700 dark:text-blue-300 uppercase mb-1">
                        Type Custom Department Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Cyber Security / Examination / Transport"
                        value={newUserData.customDepartment}
                        onChange={e => setNewUserData(p => ({ ...p, customDepartment: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        autoFocus
                      />
                      <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-400">
                        Naya department yahan likhein. Add hoty hi user k sath Chat group bhi ban jaye ga.
                      </p>
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Role</label>
                    <select
                      value={newUserData.role}
                      onChange={e => setNewUserData(p => ({ ...p, role: e.target.value as any }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="user">User (Staff / Faculty)</option>
                      <option value="it_member">IT Member</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Account Status</label>
                    <select
                      value={newUserData.status}
                      onChange={e => setNewUserData(p => ({ ...p, status: e.target.value as any }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="active">Active (Instant Access)</option>
                      <option value="pending">Pending Approval</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsAddUserModalOpen(false)} 
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={addUserLoading}
                    className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {addUserLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create User'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
