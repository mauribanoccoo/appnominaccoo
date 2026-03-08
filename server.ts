import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
// The port is determined by the environment variable PORT, or defaults to 3001.
// This ensures compatibility with both the AI Studio preview (port 3000)
// and Cloud Run (port 8080 or as specified by the environment).
const portEnv = process.env['PORT'];
const port = Number(portEnv) || 3001;

// Log to file for debugging
const logFile = join(__dirname, 'server.log');
function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(logFile, logMessage);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

log(`Starting server...`);
log(`Environment PORT: ${portEnv}`);
log(`Selected Port: ${port}`);

const USERS_FILE = join(__dirname, 'users.json');
const EMPLOYEES_FILE = join(__dirname, 'employees.json');
const GUEST_STATS_FILE = join(__dirname, 'guest_stats.json');

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

// Initialize employees file if it doesn't exist
if (!fs.existsSync(EMPLOYEES_FILE)) {
  fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify({}));
}

// Initialize guest stats file if it doesn't exist
if (!fs.existsSync(GUEST_STATS_FILE)) {
  fs.writeFileSync(GUEST_STATS_FILE, JSON.stringify({ totalGuestLogins: 0 }));
}

const PAYROLL_DATA_FILE = join(__dirname, 'payroll_data.json');
if (!fs.existsSync(PAYROLL_DATA_FILE)) {
  fs.writeFileSync(PAYROLL_DATA_FILE, JSON.stringify([]));
}

function getPayrollData() {
  try {
    if (fs.existsSync(PAYROLL_DATA_FILE)) {
      return JSON.parse(fs.readFileSync(PAYROLL_DATA_FILE, 'utf8'));
    }
    return [];
  } catch (err) {
    console.error('Error reading payroll data:', err);
    return [];
  }
}

function savePayrollData(data: any) {
  try {
    fs.writeFileSync(PAYROLL_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing payroll data:', err);
  }
}

interface UserProfile {
  matricula: string;
  contrasena: string;
  categoria: string;
  porcentualidad: number;
  mesIngreso: number;
  anoAntiguedad: number;
  cobraFlexibilidad?: boolean;
  plusMando?: boolean;
  plusPersonal?: boolean;
  securityQuestion?: string;
  securityAnswer?: string;
  failedAttempts?: number;
  lockoutUntil?: number;
  expiresAt?: number;
  registrationDate?: string;
}

const SUPER_USER: UserProfile = {
  matricula: 'MauricioAlfaro',
  contrasena: '808515@Ivan',
  categoria: 'ADMIN',
  porcentualidad: 100,
  mesIngreso: 1,
  anoAntiguedad: 2000
};

function getUsers(): UserProfile[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const users: UserProfile[] = JSON.parse(data);
      
      // Filter out expired guest accounts
      const now = Date.now();
      const validUsers = users.filter(u => u.expiresAt === undefined || u.expiresAt === null || u.expiresAt > now);
      
      if (validUsers.length !== users.length) {
        saveUsers(validUsers);
        return validUsers;
      }
      
      return users;
    }
    return [];
  } catch (err) {
    console.error('Error reading users file:', err);
    return [];
  }
}

function saveUsers(users: UserProfile[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Error writing users file:', err);
  }
}

function getEmployees(): Record<string, string> {
  try {
    if (fs.existsSync(EMPLOYEES_FILE)) {
      const data = fs.readFileSync(EMPLOYEES_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error('Error reading employees file:', err);
    return {};
  }
}

function saveEmployees(employees: Record<string, string>) {
  try {
    fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(employees, null, 2));
  } catch (err) {
    console.error('Error writing employees file:', err);
  }
}

function getGuestStats(): { totalGuestLogins: number, guestHistory?: { matricula: string, date: string }[] } {
  try {
    if (fs.existsSync(GUEST_STATS_FILE)) {
      return JSON.parse(fs.readFileSync(GUEST_STATS_FILE, 'utf8'));
    }
    return { totalGuestLogins: 0, guestHistory: [] };
  } catch (err) {
    console.error('Error reading guest stats:', err);
    return { totalGuestLogins: 0, guestHistory: [] };
  }
}

function saveGuestStats(stats: { totalGuestLogins: number, guestHistory?: { matricula: string, date: string }[] }) {
  try {
    fs.writeFileSync(GUEST_STATS_FILE, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error('Error writing guest stats:', err);
  }
}

// API Routes
app.get('/api/employees', (req, res) => {
  res.json(getEmployees());
});

app.post('/api/employees', (req, res) => {
  const { matricula, nombre } = req.body;
  if (!matricula || !nombre) {
    res.status(400).json({ success: false, message: 'Matrícula y nombre son requeridos.' });
    return;
  }
  
  const employees = getEmployees();
  employees[matricula] = nombre;
  saveEmployees(employees);
  
  res.json({ success: true, message: 'Empleado guardado correctamente.' });
});

app.delete('/api/employees/:matricula', (req, res) => {
  const { matricula } = req.params;
  const employees = getEmployees();
  
  if (employees[matricula]) {
    delete employees[matricula];
    saveEmployees(employees);
    res.json({ success: true, message: 'Empleado eliminado correctamente.' });
  } else {
    res.status(404).json({ success: false, message: 'Empleado no encontrado.' });
  }
});

app.get('/api/users', (req, res) => {
  const users = getUsers();
  // Don't return passwords in plain text to the admin dashboard
  const sanitizedUsers = users.map(({ contrasena, securityAnswer, ...rest }) => rest);
  res.json(sanitizedUsers);
});

app.post('/api/login', (req, res) => {
  const { matricula, contrasena } = req.body;

  if (matricula === SUPER_USER.matricula && contrasena === SUPER_USER.contrasena) {
    res.json({ success: true, user: SUPER_USER });
    return;
  }

  const users = getUsers();
  const userIndex = users.findIndex(u => u.matricula === matricula);

  if (userIndex === -1) {
    res.json({ success: false, message: 'Matrícula no encontrada.' });
    return;
  }

  const user = users[userIndex];

  if (user.lockoutUntil && user.lockoutUntil > Date.now()) {
    const remainingMinutes = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
    res.json({ success: false, message: `Cuenta bloqueada. Inténtalo de nuevo en ${remainingMinutes} minutos.` });
    return;
  }

  if (user.contrasena === contrasena) {
    user.failedAttempts = 0;
    user.lockoutUntil = undefined;
    users[userIndex] = user;
    saveUsers(users);
    res.json({ success: true, user });
    return;
  } else {
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    if (user.failedAttempts >= 5) {
      user.lockoutUntil = Date.now() + 5 * 60 * 1000;
      users[userIndex] = user;
      saveUsers(users);
      res.json({ success: false, message: 'Demasiados intentos fallidos. Cuenta bloqueada por 5 minutos.' });
      return;
    }
    users[userIndex] = user;
    saveUsers(users);
    res.json({ success: false, message: `Contraseña incorrecta. Intentos restantes: ${5 - user.failedAttempts}` });
    return;
  }
});

app.post('/api/register', (req, res) => {
  const profile = req.body;
  const users = getUsers();

  if (users.some(u => u.matricula === profile.matricula)) {
    res.json({ success: false, message: 'La matrícula ya está registrada.' });
    return;
  }

  profile.registrationDate = new Date().toISOString();

  users.push(profile);
  saveUsers(users);
  res.json({ success: true, user: profile });
});

// Rate limiting for guest logins
const guestLoginAttempts: Record<string, { count: number, firstAttemptTime: number, blockedUntil?: number }> = {};

app.post('/api/guest-login', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  // Initialize or clean up record for this IP
  if (!guestLoginAttempts[ip]) {
    guestLoginAttempts[ip] = { count: 0, firstAttemptTime: now };
  }
  
  const record = guestLoginAttempts[ip];

  // Check if blocked
  if (record.blockedUntil && record.blockedUntil > now) {
    const remainingSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    res.json({ success: false, message: `Demasiados intentos. Inténtalo de nuevo en ${remainingSeconds} segundos.` });
    return;
  }

  // Reset window if passed (1 minute window)
  if (now - record.firstAttemptTime > 60000) {
    record.count = 0;
    record.firstAttemptTime = now;
    record.blockedUntil = undefined;
  }

  // Increment attempts
  record.count++;

  // Check limit (5 attempts per minute)
  if (record.count > 5) {
    record.blockedUntil = now + 5 * 60 * 1000; // Block for 5 minutes
    res.json({ success: false, message: 'Has excedido el límite de intentos. Bloqueado por 5 minutos.' });
    return;
  }

  const users = getUsers();
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const matricula = `GUEST_${randomId}`;
  
  const guestUser: UserProfile = {
    matricula,
    contrasena: 'guest',
    categoria: 'DIRECTO_A000', // Default category
    porcentualidad: 100,
    mesIngreso: 1,
    anoAntiguedad: new Date().getFullYear(),
    expiresAt: Date.now() + 15 * 60 * 1000, // Expires in 15 minutes
    registrationDate: new Date().toISOString()
  };
  
  users.push(guestUser);
  saveUsers(users);
  
  // Increment guest stats
  const stats = getGuestStats();
  stats.totalGuestLogins++;
  if (!stats.guestHistory) {
    stats.guestHistory = [];
  }
  stats.guestHistory.push({ matricula, date: guestUser.registrationDate || new Date().toISOString() });
  saveGuestStats(stats);
  
  res.json({ success: true, user: guestUser });
});

app.get('/api/admin/guest-stats', (req, res) => {
  res.json(getGuestStats());
});

app.post('/api/admin/reset-guest-stats', (req, res) => {
  saveGuestStats({ totalGuestLogins: 0, guestHistory: [] });
  res.json({ success: true, message: 'Contador de invitados reiniciado.' });
});

app.get('/api/payroll-data', (req, res) => {
  res.json(getPayrollData());
});

app.post('/api/admin/payroll-data', (req, res) => {
  const { year, kValue, primaMinimaGarantizada, baseMaximaCotizacion, meiValue, data } = req.body;
  if (!year || !kValue || !data) {
    res.status(400).json({ success: false, message: 'Faltan datos requeridos (año, valor K, o datos).' });
    return;
  }
  
  const allData = getPayrollData();
  const existingIndex = allData.findIndex((d: any) => d.year === year);
  
  const yearData = { year, kValue, primaMinimaGarantizada, baseMaximaCotizacion, meiValue, data };
  
  if (existingIndex >= 0) {
    allData[existingIndex] = yearData;
  } else {
    allData.push(yearData);
  }
  
  savePayrollData(allData);
  res.json({ success: true, message: `Datos del año ${year} guardados correctamente.` });
});

app.delete('/api/admin/payroll-data/:year', (req, res) => {
  const year = Number(req.params.year);
  if (!year || isNaN(year)) {
    res.status(400).json({ success: false, message: 'Año inválido.' });
    return;
  }

  let allData = getPayrollData();
  const initialLength = allData.length;
  allData = allData.filter((d: any) => d.year !== year);

  if (allData.length !== initialLength) {
    savePayrollData(allData);
    res.json({ success: true, message: `Datos del año ${year} eliminados correctamente.` });
  } else {
    res.status(404).json({ success: false, message: 'Año no encontrado.' });
  }
});

app.delete('/api/users/:matricula', (req, res) => {
  const { matricula } = req.params;
  let users = getUsers();
  const initialCount = users.length;
  
  const targetMatricula = String(matricula).trim().toLowerCase();
  users = users.filter(u => String(u.matricula).trim().toLowerCase() !== targetMatricula);

  if (users.length !== initialCount) {
    saveUsers(users);
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Usuario no encontrado.' });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { matricula, answer, newPassword } = req.body;
  const users = getUsers();
  const userIndex = users.findIndex(u => u.matricula === matricula);

  if (userIndex === -1) {
    res.json({ success: false, message: 'Matrícula no encontrada.' });
    return;
  }

  const user = users[userIndex];
  if (user.securityAnswer?.toLowerCase().trim() === answer.toLowerCase().trim()) {
    user.contrasena = newPassword;
    user.failedAttempts = 0;
    user.lockoutUntil = undefined;
    users[userIndex] = user;
    saveUsers(users);
    res.json({ success: true, message: 'Contraseña restablecida con éxito.' });
  } else {
    res.json({ success: false, message: 'Respuesta de seguridad incorrecta.' });
  }
});

app.get('/api/security-question/:matricula', (req, res) => {
  const { matricula } = req.params;
  const users = getUsers();
  const user = users.find(u => u.matricula === matricula);
  
  if (user && user.securityQuestion) {
    res.json({ question: user.securityQuestion });
  } else {
    res.status(404).json({ message: 'Pregunta no encontrada' });
  }
});

app.get('/api/admin/export-users', (req, res) => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      res.download(USERS_FILE, 'users_backup.json');
    } else {
      res.status(404).json({ success: false, message: 'No hay base de datos de usuarios para exportar.' });
    }
  } catch (err) {
    console.error('Error exporting users:', err);
    res.status(500).json({ success: false, message: 'Error al exportar usuarios.' });
  }
});

app.post('/api/admin/import-users', (req, res) => {
  try {
    const users = req.body;
    if (!Array.isArray(users)) {
      res.status(400).json({ success: false, message: 'El formato del archivo no es válido. Debe ser un arreglo de usuarios.' });
      return;
    }
    
    // Basic validation to ensure it looks like user data
    if (users.length > 0 && (!users[0].matricula || !users[0].contrasena)) {
       res.status(400).json({ success: false, message: 'El formato de los datos de usuario no es válido.' });
       return;
    }

    saveUsers(users);
    res.json({ success: true, message: 'Base de datos de usuarios importada correctamente.' });
  } catch (err) {
    console.error('Error importing users:', err);
    res.status(500).json({ success: false, message: 'Error al importar usuarios.' });
  }
});

log(`Starting server...`);
log(`Environment PORT: ${portEnv}`);
log(`Selected Port: ${port}`);

// Serve static files from the Angular build output directory
// Newer Angular versions (using @angular/build:application) output to dist/browser
let distPath = join(__dirname, 'dist', 'browser');
if (!fs.existsSync(distPath)) {
  log(`Dist path ${distPath} does not exist. Checking parent...`);
  distPath = join(__dirname, 'dist');
}

if (fs.existsSync(distPath)) {
  log(`Serving static files from: ${distPath}`);
} else {
  log(`CRITICAL: Dist path ${distPath} does not exist! Build might have failed.`);
}

app.use(express.static(distPath));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// For all other routes, serve the index.html file
app.get(/.*/, (req, res) => {
  const indexPath = join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    log(`CRITICAL: Index file not found at ${indexPath}`);
    res.status(500).send('Application not built correctly - index.html missing');
  }
});

try {
  const server = app.listen(port, '0.0.0.0', () => {
    log(`Server is running on http://0.0.0.0:${port}`);
  });
  
  server.on('error', (err) => {
    log(`Server failed to start: ${err}`);
  });
} catch (err) {
  log(`Exception starting server: ${err}`);
}
