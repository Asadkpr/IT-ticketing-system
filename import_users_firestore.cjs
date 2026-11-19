const XLSX = require('xlsx');
const path = require('path');

async function importUsers() {
  const apiKey = "AIzaSyDsO1fYRecLatGJHfjRDOdMKDxTkVAzDzI";
  const projectId = "ticketing-system-f0ffd";

  // Read Excel file
  console.log('Reading Excel file...');
  const workbook = XLSX.readFile(path.join(__dirname, 'public', 'Employee list.xlsx'));
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);

  console.log(`Found ${data.length} users in the Excel file.`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = row['Employ Name '];
    const email = row['Email/Username'];
    const designation = row['Desination'];
    const department = row['Department'];

    if (!email || !name) {
      console.log(`Skipping row ${i + 1} - missing email or name`);
      continue;
    }

    try {
      // 1. Check if user exists in Firestore
      const queryResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'users' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'email' },
                op: 'EQUAL',
                value: { stringValue: email.trim() }
              }
            }
          }
        })
      });

      const queryData = await queryResponse.json();
      if (queryData && queryData[0] && queryData[0].document) {
        console.log(`[${i + 1}/${data.length}] User ${email} already exists in Firestore. Skipping.`);
        continue;
      }

      const uid = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

      // 2. Save to Firestore
      const userDoc = {
        fields: {
          uid: { stringValue: uid },
          name: { stringValue: name.trim() },
          email: { stringValue: email.trim() },
          department: { stringValue: department ? department.trim() : 'Unknown' },
          designation: { stringValue: designation ? designation.trim() : 'Unknown' },
          role: { stringValue: 'user' },
          status: { stringValue: 'active' },
          createdAt: { stringValue: new Date().toISOString() },
          password: { stringValue: '123456' }
        }
      };

      const dbResponse = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userDoc)
      });

      if (!dbResponse.ok) {
        const dbData = await dbResponse.json();
        throw new Error(dbData.error?.message || 'Unknown Firestore Error');
      }

      console.log(`[${i + 1}/${data.length}] Successfully created user: ${email}`);
      successCount++;

    } catch (err) {
      console.error(`[${i + 1}/${data.length}] Error creating ${email}:`, err.message);
      errorCount++;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\nImport Complete!`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
}

importUsers().catch(console.error);
