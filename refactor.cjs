const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add setDoc and doc imports to firebase/firestore import
if (!content.includes('setDoc')) {
  content = content.replace(
    /import {\s*(.*)\s*} from 'firebase\/firestore';/s,
    "import { $1, setDoc, doc, deleteDoc } from 'firebase/firestore';"
  );
}

// 2. Add Gemini import
if (!content.includes('@google/genai')) {
  content = content.replace(
    /import \* as XLSX from 'xlsx';/,
    "import * as XLSX from 'xlsx';\nimport { GoogleGenAI } from '@google/genai';"
  );
}

// 3. Replace createTicket
content = content.replace(
  /const createTicket = async \(e: React\.FormEvent\) => \{[\s\S]*?catch \(error\) \{\s*console\.error\("Error creating ticket:", error\);\s*\}\s*\};/,
  `const createTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const ticketData: SupportTicket = {
      title: newTicket.title,
      category: newTicket.category,
      description: newTicket.description,
      priority: newTicket.priority,
      attachment: newTicket.attachment || undefined,
      deadline: newTicket.deadline || undefined,
      id: \`ticket-\${Date.now()}\`,
      status: 'open',
      createdBy: user.uid,
      creatorName: user.name,
      department: user.department,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'tickets', ticketData.id), ticketData);
      setIsCreating(false);
      setNewTicket({ title: '', category: CATEGORIES[0], description: '', priority: 'medium', deadline: '', attachment: null });
    } catch (error) {
      console.error("Error creating ticket:", error);
    }
  };`
);

function replaceFunction(funcName, newBody) {
  const regex = new RegExp(`const ${funcName} = async \\(.*?\\) => \\{[\\s\\S]*?catch \\(error\\) \\{[\\s\\S]*?\\}\\s*\\};`);
  content = content.replace(regex, newBody);
}

replaceFunction('resolveTicket', `const resolveTicket = async (ticketId: string, comment: string) => {
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
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
    } catch (error) {
      console.error("Error resolving ticket:", error);
    }
  };`);

replaceFunction('closeTicket', `const closeTicket = async (ticketId: string, comment: string) => {
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
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
    } catch (error) {
      console.error("Error closing ticket:", error);
    }
  };`);

replaceFunction('assignTicket', `const assignTicket = async (ticketId: string, itMemberId: string) => {
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
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
    } catch (error) {
      console.error("Error assigning ticket:", error);
    }
  };`);

replaceFunction('submitFeedback', `const submitFeedback = async (ticketId: string, feedback: string) => {
    try {
      const ticket = tickets.find(t => t.id === ticketId);
      if (!ticket) return;
      const updatedTicket = {
        ...ticket,
        feedback,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
      setSelectedTicket(null);
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };`);

replaceFunction('reopenTicket', `const reopenTicket = async (ticketId: string) => {
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
      await setDoc(doc(db, 'tickets', ticketId), updatedTicket);
      if (selectedTicket?.id === ticketId) setSelectedTicket(updatedTicket);
    } catch (error) {
      console.error("Error reopening ticket:", error);
    }
  };`);

replaceFunction('sendChatMessage', `const sendChatMessage = async () => {
    if (!user || !chatInput.trim()) return;
    try {
      if (editingMessageId) {
        const msg = allMessages.find(m => m.id === editingMessageId);
        if (msg) {
          const updatedMsg = { ...msg, text: chatInput, updatedAt: new Date().toISOString(), isEdited: true };
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
        }
        const newMsg: ChatMessage = {
          id: \`msg-\${Date.now()}\`,
          text: chatInput,
          senderId: user.uid,
          senderName: user.name,
          senderRole: user.role,
          receiverId,
          targetUserId,
          createdAt: new Date().toISOString(),
          seenBy: [user.uid]
        };
        await setDoc(doc(db, 'messages', newMsg.id), newMsg);
      }
      setChatInput('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };`);

replaceFunction('deleteChatMessage', `const deleteChatMessage = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'messages', id));
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };`);

replaceFunction('updateUserRole', `const updateUserRole = async (userId: string, role: UserProfile['role']) => {
    try {
      const u = allUsers.find(user => user.uid === userId);
      if(!u) return;
      await setDoc(doc(db, 'users', userId), { ...u, role, permissions: DEFAULT_PERMISSIONS[role] });
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };`);

replaceFunction('updateUserStatus', `const updateUserStatus = async (userId: string, status: 'pending' | 'active' | 'blocked') => {
    try {
      const u = allUsers.find(user => user.uid === userId);
      if(!u) return;
      await setDoc(doc(db, 'users', userId), { ...u, status });
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };`);

replaceFunction('updateUserPermission', `const updateUserPermission = async (userId: string, permission: keyof UserPermissions, value: boolean) => {
    try {
      const u = allUsers.find(user => user.uid === userId);
      if(!u) return;
      const currentPerms = getUserPermissions(u);
      await setDoc(doc(db, 'users', userId), { ...u, permissions: { ...currentPerms, [permission]: value } });
    } catch (error) {
      console.error("Error updating permission:", error);
    }
  };`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Refactoring complete');
