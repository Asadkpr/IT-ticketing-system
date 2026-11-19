import sys
import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
if 'CheckCheck' not in content:
    content = content.replace(
        '} from \'lucide-react\';',
        '  Check,\n  CheckCheck,\n  Bell\n} from \'lucide-react\';'
    )

# 2. State
if 'const [hasUnreadNotification, setHasUnreadNotification]' not in content:
    content = content.replace(
        'const [newMsgNotification, setNewMsgNotification] = useState<{ sender: string, text: string } | null>(null);',
        'const [newMsgNotification, setNewMsgNotification] = useState<{ sender: string, text: string } | null>(null);\n  const [hasUnreadNotification, setHasUnreadNotification] = useState(false);'
    )

# 3. Notification Logic for Messages (Replace existing useEffect)
old_msg_effect = """  useEffect(() => {
    if (!user || allMessages.length === 0) return;
    const lastMsg = allMessages[allMessages.length - 1];
    const isNew = (Date.now() - new Date(lastMsg.createdAt).getTime()) < 5000;
    const isNotMe = lastMsg.senderId !== user.uid;
    const isUnseen = !lastMsg.seenBy.includes(user.uid);
    const isRelevant = !lastMsg.receiverId || lastMsg.receiverId === 'it-help-group' || lastMsg.receiverId === user.uid;

    if (isNew && isNotMe && isUnseen && isRelevant) {
      setNewMsgNotification({ sender: lastMsg.senderName, text: lastMsg.text });
      const timer = setTimeout(() => setNewMsgNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [allMessages, user]);"""

new_msg_effect = """  useEffect(() => {
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
  }, [tickets, user]);"""
if 'assets.mixkit.co' not in content:
    # Using regex to find the old useEffect since indentation might be tricky
    content = re.sub(r'  useEffect\(\(\) => \{[\s\S]*?setNewMsgNotification\(null\), 5000\);[\s\S]*?return \(\) => clearTimeout\(timer\);[\s\S]*?\}\n  \}, \[allMessages, user\]\);', new_msg_effect.replace('\\', '\\\\'), content, count=1)

# 4. Header Icon
old_header = """          <div className="flex items-center gap-4">

            <button"""
new_header = """          <div className="flex items-center gap-4">
            <button 
              onClick={() => setHasUnreadNotification(false)}
              className="relative p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <Bell className="w-6 h-6" />
              {hasUnreadNotification && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 border-2 border-white dark:border-slate-800 rounded-full animate-pulse"></span>
              )}
            </button>

            <button"""
if '<Bell className=' not in content:
    content = content.replace(old_header, new_header)

# 5. Fix send message bug
old_send = """        const newMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          text: chatInput,
          senderId: user.uid,
          senderName: user.name,
          senderRole: user.role,
          receiverId,
          targetUserId,
          createdAt: new Date().toISOString(),
          seenBy: [user.uid]
        };
        await setDoc(doc(db, 'messages', newMsg.id), newMsg);"""
new_send = """        const newMsg: any = {
          id: `msg-${Date.now()}`,
          text: chatInput,
          senderId: user.uid,
          senderName: user.name,
          senderRole: user.role,
          createdAt: new Date().toISOString(),
          seenBy: [user.uid]
        };
        if (receiverId) newMsg.receiverId = receiverId;
        if (targetUserId) newMsg.targetUserId = targetUserId;
        await setDoc(doc(db, 'messages', newMsg.id), newMsg);"""
content = content.replace(old_send, new_send)

# 6. Double Ticks
old_ticks = """                                  <div className="flex items-center">
                                    <CheckCircle2 className={cn("w-2.5 h-2.5", msg.seenBy.length > 1 ? "text-emerald-300" : "text-blue-200")} />
                                    {msg.seenBy.length > 1 && <CheckCircle2 className="w-2.5 h-2.5 -ml-1 text-emerald-300" />}
                                  </div>"""
new_ticks = """                                  <div className="flex items-center">
                                    {msg.seenBy.length > 1 ? (
                                      <CheckCheck className="w-4 h-4 text-cyan-300" />
                                    ) : (
                                      <Check className="w-4 h-4 text-blue-200" />
                                    )}
                                  </div>"""
if 'CheckCheck className="w-4 h-4' not in content:
    content = content.replace(old_ticks, new_ticks)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done refactoring')
