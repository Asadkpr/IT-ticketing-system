import sys

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

departments = '["SOA", "SADU", "SDCA", "SIR", "SCL", "Soft Skill", "IT", "HR", "Accounts", "Admissions And marketing", "Registrer", "Administrations", "QEC", "Students Affair", "Examination", "ERP"]'

# 1. Update chatMode type & DEPARTMENTS
if 'const DEPARTMENTS = ' not in content:
    content = content.replace(
        "const [chatMode, setChatMode] = useState<'public' | 'it-help' | 'private'>('public');",
        f"const DEPARTMENTS = {departments};\n  const [chatMode, setChatMode] = useState<'public' | 'it-help' | 'private' | 'department'>('public');"
    )

# 2. Update filtering in chat (around line 377)
old_filter = """    if (chatMode === 'public') {
      filtered = filtered.filter(m => !m.receiverId);"""
new_filter = """    if (chatMode === 'public') {
      filtered = filtered.filter(m => !m.receiverId);
    } else if (chatMode === 'department' && user) {
      filtered = filtered.filter(m => m.receiverId === `dept-${user.department}`);"""
content = content.replace(old_filter, new_filter)

# 3. Update handleSendMessage receiverId
old_send = """    let receiverId = '';
    if (chatMode === 'it-help') receiverId = 'it-help-group';
    else if (chatMode === 'private' && selectedChatUser) receiverId = selectedChatUser.uid;"""
new_send = """    let receiverId = '';
    if (chatMode === 'it-help') receiverId = 'it-help-group';
    else if (chatMode === 'private' && selectedChatUser) receiverId = selectedChatUser.uid;
    else if (chatMode === 'department' && user.department) receiverId = `dept-${user.department}`;"""
content = content.replace(old_send, new_send)

# 4. Add department chat button in sidebar
old_btn = """                    {allMessages.filter(m => !m.receiverId && m.senderId !== user?.uid && !m.seenBy.includes(user?.uid || '')).length > 0 && (
                      <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full"></div>
                    )}
                  </button>"""
new_btn = old_btn + """\n                  {user?.department && (
                  <button 
                    onClick={() => {
                      setChatMode('department');
                      setSelectedChatUser(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left relative",
                      chatMode === 'department' ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-slate-600 dark:text-slate-300 hover:bg-white dark:bg-slate-800 hover:shadow-sm"
                    )}
                  >
                    <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs", chatMode === 'department' ? "bg-emerald-500" : "bg-emerald-100 text-emerald-600")}>
                      D
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{user.department} Dept</p>
                      <p className={cn("text-[10px] truncate", chatMode === 'department' ? "text-emerald-100" : "text-slate-400")}>Department Chat</p>
                    </div>
                    {allMessages.filter(m => m.receiverId === `dept-${user.department}` && m.senderId !== user?.uid && !m.seenBy.includes(user?.uid || '')).length > 0 && (
                      <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full"></div>
                    )}
                  </button>
                  )}"""
if 'setChatMode(\'department\')' not in content:
    content = content.replace(old_btn, new_btn, 1)

# 5. Update Signup UI input to select
old_input = """                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Department</label>
                  <input 
                    type="text"
                    className="input"
                    placeholder="e.g. Finance"
                    value={signupData.department || ''}
                    onChange={e => setSignupData({...signupData, department: e.target.value})}
                    required
                  />"""
new_input = """                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Department</label>
                  <select 
                    className="input"
                    value={signupData.department || ''}
                    onChange={e => setSignupData({...signupData, department: e.target.value})}
                    required
                  >
                    <option value="" disabled>Select Department</option>
                    {DEPARTMENTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>"""
content = content.replace(old_input, new_input)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done refactoring')
