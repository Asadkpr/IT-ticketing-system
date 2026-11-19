const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const wb = XLSX.readFile(path.join(__dirname, 'public', 'Employee list.xlsx'));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

const defaultPermissions = {
  admin: { canViewAllTickets: true, canAssignTickets: true, canCloseTickets: true, canViewReports: true, canManageUsers: true },
  it_member: { canViewAllTickets: true, canAssignTickets: true, canCloseTickets: true, canViewReports: false, canManageUsers: false },
  user: { canViewAllTickets: false, canAssignTickets: false, canCloseTickets: false, canViewReports: false, canManageUsers: false }
};

const adminUser = {
  uid: 'admin_master_uid',
  name: 'IT Administrator',
  email: 'admin@iac.edu.pk',
  department: 'IT',
  designation: 'Head of IT / System Admin',
  role: 'admin',
  status: 'active',
  firstLoginCompleted: true,
  permissions: defaultPermissions.admin
};

const employees = [adminUser];

rows.forEach((r) => {
  const name = (r['Employ Name '] || '').trim();
  const email = (r['Email/Username'] || '').trim().toLowerCase();
  const designation = (r['Desination'] || '').trim();
  const department = (r['Department'] || '').trim();
  if (!email || !name) return;

  const isIT = department.toLowerCase().includes('information technology') || designation.toLowerCase().includes('it ') || designation.toLowerCase().includes('network');
  const role = isIT ? 'it_member' : 'user';

  employees.push({
    uid: 'emp_' + email.replace(/[^a-zA-Z0-9]/g, '_'),
    name: name,
    email: email,
    department: department || 'General',
    designation: designation || 'Staff',
    role: role,
    status: 'active',
    firstLoginCompleted: true,
    permissions: defaultPermissions[role]
  });
});

const sampleTickets = [
  {
    id: 'ticket-1700000001',
    title: 'Network connectivity issue in School of Art Lab 3',
    category: 'Network / Wi-Fi',
    description: 'High-speed internet is dropping frequently during design studio sessions in Lab 3.',
    status: 'open',
    priority: 'high',
    createdBy: 'emp_adnan_ishaq_iac_edu_pk',
    creatorName: 'Adnan Ishaq',
    department: 'School of Art',
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  },
  {
    id: 'ticket-1700000002',
    title: 'Adobe Creative Cloud license activation required',
    category: 'Software / Applications',
    description: 'Need Adobe Illustrator and Premiere Pro activated on new animation editing workstation.',
    status: 'in-progress',
    priority: 'medium',
    createdBy: 'emp_adeel_mustafa_iac_edu_pk',
    creatorName: 'Adeel Mustafa',
    department: 'School of Informatics and Robotics',
    assignedTo: 'admin_master_uid',
    assignedToName: 'IT Administrator',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString()
  },
  {
    id: 'ticket-1700000003',
    title: 'Projector display signal missing in Lecture Hall Room 204',
    category: 'Hardware',
    description: 'HDMI connection from podium to ceiling projector produces no signal.',
    status: 'open',
    priority: 'high',
    createdBy: 'emp_ahmed_hassan_iac_edu_pk',
    creatorName: 'Ahmed Hassan',
    department: 'School of Architecture, Design and Urbanism',
    createdAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString()
  },
  {
    id: 'ticket-1700000004',
    title: 'Campus Portal password reset for faculty account',
    category: 'Accounts / Access',
    description: 'Unable to login to portal for attendance submission.',
    status: 'resolved',
    priority: 'low',
    createdBy: 'emp_aisha_abdullah_iac_edu_pk',
    creatorName: 'Aisha Abdullah',
    department: 'School of Culture and Languages',
    resolvedBy: 'admin_master_uid',
    resolvedByName: 'IT Administrator',
    resolvedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    resolutionComment: 'Password has been reset and temporary credentials shared via phone.',
    createdAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
  },
  {
    id: 'ticket-1700000005',
    title: 'Network printer toner replacement in Registrar Office',
    category: 'Printer / Scanner',
    description: 'HP LaserJet printer is showing low black toner warning and printing faded documents.',
    status: 'closed',
    priority: 'medium',
    createdBy: 'emp_alisha_nawaz_iac_edu_pk',
    creatorName: 'Alisha Nawaz',
    department: 'Office of the Registrar',
    resolvedBy: 'admin_master_uid',
    resolvedByName: 'IT Administrator',
    resolvedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    closedBy: 'admin_master_uid',
    closedByName: 'IT Administrator',
    closedAt: new Date(Date.now() - 40 * 3600 * 1000).toISOString(),
    resolutionComment: 'Installed new OEM high-yield black toner cartridge. Test page printed successfully.',
    createdAt: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 40 * 3600 * 1000).toISOString()
  }
];

const tsContent = `// Auto-generated default directory and seed data for offline / fallback resilience

export const DEFAULT_EMPLOYEES = ${JSON.stringify(employees, null, 2)};

export const DEFAULT_TICKETS = ${JSON.stringify(sampleTickets, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'src', 'defaultData.ts'), tsContent, 'utf8');
console.log('Successfully created src/defaultData.ts with', employees.length, 'employees and', sampleTickets.length, 'tickets');

