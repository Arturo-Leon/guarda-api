const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const dbPath = path.join(__dirname, 'guarda_equipajes.db');
let db;

// Abrir/crear base de datos
async function openDb() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
        console.log('📁 Base de datos cargada');
    } else {
        db = new SQL.Database();
        console.log('📁 Nueva base de datos creada');
    }
}

// Guardar cambios en disco
function saveDb() {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
}

// Ejecutar SQL y guardar automáticamente
function run(sql, params = []) {
    db.run(sql, params);
    saveDb();
}

// Crear tablas
function createTables() {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        rol TEXT
    )`);
    db.run(`INSERT OR IGNORE INTO usuarios (username, password, rol) VALUES ('Administrador', 'admin123', 'admin')`);
    
    db.run(`CREATE TABLE IF NOT EXISTS lockers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        tamanio TEXT,
        estado TEXT DEFAULT 'disponible'
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        identificacion TEXT UNIQUE,
        telefono TEXT,
        email TEXT,
        direccion TEXT,
        registros INTEGER DEFAULT 0,
        total_gastado REAL DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sucursales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        direccion TEXT,
        telefono TEXT,
        email TEXT,
        activo INTEGER DEFAULT 1,
        fecha_creacion TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS configuracion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clave TEXT UNIQUE,
        valor TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS registros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_registro TEXT,
        codigo_equipaje TEXT,
        locker_id INTEGER,
        locker_codigo TEXT,
        tamanio_locker TEXT,
        cliente_nombre TEXT,
        cliente_identificacion TEXT,
        cliente_telefono TEXT,
        descripcion_equipaje TEXT,
        fecha TEXT,
        hora TEXT,
        monto REAL,
        estado TEXT DEFAULT 'activo',
        metodo_pago TEXT,
        fecha_retiro TEXT,
        hora_retiro TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS movimientos_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        concepto TEXT,
        monto REAL,
        metodo TEXT,
        fecha TEXT,
        hora TEXT,
        registro TEXT,
        descripcion TEXT,
        observaciones TEXT
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS historial_cierres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno INTEGER,
        fechaApertura TEXT,
        horaApertura TEXT,
        fechaCierre TEXT,
        horaCierre TEXT,
        montoInicial REAL,
        ingresos REAL,
        egresos REAL,
        pendientes REAL,
        totalEsperado REAL,
        arqueoEfectivo REAL,
        diferencia REAL,
        estado TEXT,
        observaciones TEXT,
        descripcion TEXT
    )`);
    
    saveDb();
    console.log('✅ Tablas listas');
}

// ============ VERIFICAR TOKEN ============
function verifyToken(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.split(' ')[1];
    try {
        const decoded = jwt.verify(token, 'secreto');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
}

// ============ LOGIN ============
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare('SELECT * FROM usuarios WHERE username = ?');
    const user = stmt.get([username]);
    stmt.free();
    
    if (!user) return res.status(401).json({ error: 'Usuario no existe' });
    if (password === user.password) {
        const token = jwt.sign({ id: user.id, username: user.username }, 'secreto');
        res.json({ success: true, token, usuario: { id: user.id, username: user.username, rol: user.rol } });
    } else {
        res.status(401).json({ error: 'Contraseña incorrecta' });
    }
});

// ============ LOCKERS ============
app.get('/api/lockers', verifyToken, (req, res) => {
    const rows = db.exec('SELECT * FROM lockers ORDER BY codigo');
    const lockers = rows.length > 0 ? rows[0].values.map(r => {
        const cols = rows[0].columns;
        let obj = {};
        cols.forEach((c, i) => obj[c] = r[i]);
        return obj;
    }) : [];
    res.json({ success: true, lockers });
});

app.post('/api/lockers', verifyToken, (req, res) => {
    const { codigo, tamanio, estado } = req.body;
    run('INSERT INTO lockers (codigo, tamanio, estado) VALUES (?, ?, ?)', [codigo, tamanio || 'mediano', estado || 'disponible']);
    const id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    res.json({ success: true, id });
});

app.put('/api/lockers/:id', verifyToken, (req, res) => {
    const { codigo, tamanio, estado } = req.body;
    run('UPDATE lockers SET codigo = ?, tamanio = ?, estado = ? WHERE id = ?', [codigo, tamanio, estado, req.params.id]);
    res.json({ success: true });
});

app.delete('/api/lockers/:id', verifyToken, (req, res) => {
    run('DELETE FROM lockers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============ CLIENTES ============
app.get('/api/clientes', verifyToken, (req, res) => {
    const rows = db.exec('SELECT * FROM clientes ORDER BY id');
    const clientes = rows.length > 0 ? rows[0].values.map(r => {
        const cols = rows[0].columns;
        let obj = {};
        cols.forEach((c, i) => obj[c] = r[i]);
        return obj;
    }) : [];
    res.json({ success: true, clientes });
});

app.post('/api/clientes', verifyToken, (req, res) => {
    const { id, nombre, identificacion, telefono, email, direccion, registros, total_gastado } = req.body;
    if (id) {
        run('UPDATE clientes SET nombre=?, identificacion=?, telefono=?, email=?, direccion=?, registros=?, total_gastado=? WHERE id=?',
            [nombre, identificacion, telefono || null, email || null, direccion || null, registros || 0, total_gastado || 0, id]);
        res.json({ success: true, id: parseInt(id) });
    } else {
        run('INSERT INTO clientes (nombre, identificacion, telefono, email, direccion, registros, total_gastado) VALUES (?,?,?,?,?,?,?)',
            [nombre, identificacion, telefono || null, email || null, direccion || null, registros || 0, total_gastado || 0]);
        const newId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
        res.json({ success: true, id: newId });
    }
});

app.delete('/api/clientes/:id', verifyToken, (req, res) => {
    run('DELETE FROM clientes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============ REGISTROS ============
app.get('/api/registros', verifyToken, (req, res) => {
    const rows = db.exec('SELECT * FROM registros ORDER BY id DESC');
    const registros = rows.length > 0 ? rows[0].values.map(r => {
        const cols = rows[0].columns;
        let obj = {};
        cols.forEach((c, i) => obj[c] = r[i]);
        return obj;
    }) : [];
    res.json({ success: true, registros });
});

app.post('/api/registros', verifyToken, (req, res) => {
    const { numero_registro, codigo_equipaje, locker_id, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono, descripcion_equipaje, fecha, hora, monto, estado, metodo_pago } = req.body;
    run(`INSERT INTO registros (numero_registro, codigo_equipaje, locker_id, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono, descripcion_equipaje, fecha, hora, monto, estado, metodo_pago) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numero_registro, codigo_equipaje, locker_id || null, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono || null, descripcion_equipaje || null, fecha, hora, monto, estado || 'activo', metodo_pago]);
    if (locker_codigo) {
        run('UPDATE lockers SET estado = ? WHERE codigo = ?', ['ocupado', locker_codigo]);
    }
    const id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    res.json({ success: true, id });
});

app.post('/api/registros/:id/retirar', verifyToken, (req, res) => {
    const { fecha_retiro, hora_retiro, metodo_pago, monto } = req.body;
    const row = db.exec(`SELECT locker_codigo FROM registros WHERE id = ${req.params.id}`);
    if (row.length > 0 && row[0].values.length > 0) {
        const locker = row[0].values[0][0];
        if (locker) run('UPDATE lockers SET estado = ? WHERE codigo = ?', ['disponible', locker]);
    }
    run('UPDATE registros SET estado = ?, fecha_retiro = ?, hora_retiro = ?, metodo_pago = ?, monto = ? WHERE id = ?',
        ['finalizado', fecha_retiro, hora_retiro, metodo_pago, monto || 0, req.params.id]);
    res.json({ success: true });
});

app.put('/api/registros/:id', verifyToken, (req, res) => {
    const { tamanio_locker, metodo_pago, monto } = req.body;
    if (monto) run('UPDATE registros SET monto = ? WHERE id = ?', [monto, req.params.id]);
    res.json({ success: true });
});

// ============ MOVIMIENTOS ============
app.get('/api/movimientos', verifyToken, (req, res) => {
    const rows = db.exec('SELECT * FROM movimientos_caja ORDER BY id DESC');
    const movimientos = rows.length > 0 ? rows[0].values.map(r => {
        const cols = rows[0].columns;
        let obj = {};
        cols.forEach((c, i) => obj[c] = r[i]);
        return obj;
    }) : [];
    res.json({ success: true, movimientos });
});

app.post('/api/movimientos', verifyToken, (req, res) => {
    const { tipo, concepto, monto, metodo, fecha, hora, registro, descripcion, observaciones } = req.body;
    run('INSERT INTO movimientos_caja (tipo, concepto, monto, metodo, fecha, hora, registro, descripcion, observaciones) VALUES (?,?,?,?,?,?,?,?,?)',
        [tipo, concepto, monto, metodo, fecha, hora, registro, descripcion || null, observaciones || null]);
    const id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    res.json({ success: true, id });
});

app.put('/api/movimientos/:id', verifyToken, (req, res) => {
    const { tipo, concepto, monto, metodo, fecha, hora, registro } = req.body;
    run('UPDATE movimientos_caja SET tipo=?, concepto=?, monto=?, metodo=?, fecha=?, hora=?, registro=? WHERE id=?',
        [tipo, concepto, monto, metodo, fecha, hora, registro, req.params.id]);
    res.json({ success: true });
});

// ============ CIERRES ============
app.get('/api/historial/cierres', verifyToken, (req, res) => {
    const rows = db.exec('SELECT * FROM historial_cierres ORDER BY id DESC');
    const historial = rows.length > 0 ? rows[0].values.map(r => {
        const cols = rows[0].columns;
        let obj = {};
        cols.forEach((c, i) => obj[c] = r[i]);
        return obj;
    }) : [];
    res.json({ success: true, historial });
});

app.post('/api/cierre', verifyToken, (req, res) => {
    const { turno, fechaApertura, horaApertura, fechaCierre, horaCierre, montoInicial, ingresos, egresos, pendientes, totalEsperado, arqueoEfectivo, diferencia, estado, observaciones, descripcion } = req.body;
    run(`INSERT INTO historial_cierres (turno, fechaApertura, horaApertura, fechaCierre, horaCierre, montoInicial, ingresos, egresos, pendientes, totalEsperado, arqueoEfectivo, diferencia, estado, observaciones, descripcion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [turno, fechaApertura, horaApertura, fechaCierre, horaCierre, montoInicial, ingresos, egresos, pendientes, totalEsperado, arqueoEfectivo, diferencia, estado, observaciones || null, descripcion || null]);
    const id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    res.json({ success: true, id });
});

// ============ CONFIGURACIÓN ============
app.post('/api/configuracion/precios', verifyToken, (req, res) => {
    const { configPrecios, tarifasHoras, configPreciosExtra } = req.body;
    run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', ['configPrecios', JSON.stringify(configPrecios)]);
    run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', ['tarifasHoras', JSON.stringify(tarifasHoras)]);
    run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', ['configPreciosExtra', JSON.stringify(configPreciosExtra || {})]);
    res.json({ success: true });
});

app.get('/api/configuracion/precios', verifyToken, (req, res) => {
    const rows = db.exec('SELECT clave, valor FROM configuracion WHERE clave IN ("configPrecios", "tarifasHoras", "configPreciosExtra")');
    const result = {};
    if (rows.length > 0) {
        rows[0].values.forEach(r => {
            try { result[r[0]] = JSON.parse(r[1]); } catch(e) {}
        });
    }
    res.json({ success: true, configuracion: result });
});

app.post('/api/configuracion/sistema', verifyToken, (req, res) => {
    const { configSistema } = req.body;
    run('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)', ['configSistema', JSON.stringify(configSistema)]);
    res.json({ success: true });
});

app.get('/api/configuracion/sistema', verifyToken, (req, res) => {
    const rows = db.exec('SELECT valor FROM configuracion WHERE clave = ?', ['configSistema']);
    let config = null;
    if (rows.length > 0 && rows[0].values.length > 0) {
        try { config = JSON.parse(rows[0].values[0][0]); } catch(e) {}
    }
    res.json({ success: true, configSistema: config });
});

// ============ SUCURSALES ============
app.get('/api/sucursales', verifyToken, (req, res) => {
    const rows = db.exec('SELECT * FROM sucursales ORDER BY id');
    const sucursales = rows.length > 0 ? rows[0].values.map(r => {
        const cols = rows[0].columns;
        let obj = {};
        cols.forEach((c, i) => obj[c] = r[i]);
        return obj;
    }) : [];
    res.json({ success: true, sucursales });
});

app.post('/api/sucursales', verifyToken, (req, res) => {
    const { id, nombre, direccion, telefono, email, activo } = req.body;
    if (id) {
        run('UPDATE sucursales SET nombre=?, direccion=?, telefono=?, email=?, activo=? WHERE id=?', [nombre, direccion, telefono, email, activo, id]);
        res.json({ success: true });
    } else {
        run('INSERT INTO sucursales (nombre, direccion, telefono, email, activo) VALUES (?,?,?,?,?)', [nombre, direccion, telefono, email, activo || 1]);
        const newId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
        res.json({ success: true, id: newId });
    }
});

app.delete('/api/sucursales/:id', verifyToken, (req, res) => {
    run('DELETE FROM sucursales WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============ USUARIOS ============
app.get('/api/usuarios', verifyToken, (req, res) => {
    const rows = db.exec('SELECT id, nombre, username, rol, activo, fecha_creacion FROM usuarios ORDER BY id');
    const usuarios = rows.length > 0 ? rows[0].values.map(r => {
        const cols = rows[0].columns;
        let obj = {};
        cols.forEach((c, i) => obj[c] = r[i]);
        return obj;
    }) : [];
    res.json({ success: true, usuarios });
});

app.post('/api/usuarios', verifyToken, (req, res) => {
    const { id, nombre, username, password, rol, activo } = req.body;
    if (id) {
        if (password) run('UPDATE usuarios SET nombre=?, username=?, password=?, rol=?, activo=? WHERE id=?', [nombre, username, password, rol, activo, id]);
        else run('UPDATE usuarios SET nombre=?, username=?, rol=?, activo=? WHERE id=?', [nombre, username, rol, activo, id]);
        res.json({ success: true });
    } else {
        run('INSERT INTO usuarios (nombre, username, password, rol, activo, fecha_creacion) VALUES (?,?,?,?,?,datetime("now"))', [nombre, username, password || 'admin123', rol || 'operador', activo || 1]);
        const newId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
        res.json({ success: true, id: newId });
    }
});

app.delete('/api/usuarios/:id', verifyToken, (req, res) => {
    run('DELETE FROM usuarios WHERE id = ? AND username != ?', [req.params.id, 'Administrador']);
    res.json({ success: true });
});

// ============ MANTENIMIENTO ============
app.delete('/api/admin/clear/clientes', verifyToken, (req, res) => { run('DELETE FROM clientes'); res.json({ success: true }); });
app.delete('/api/admin/clear/lockers', verifyToken, (req, res) => { run('DELETE FROM lockers'); res.json({ success: true }); });
app.delete('/api/admin/clear/registros', verifyToken, (req, res) => { run('DELETE FROM registros'); res.json({ success: true }); });
app.delete('/api/admin/clear/movimientos', verifyToken, (req, res) => { run('DELETE FROM movimientos_caja'); res.json({ success: true }); });
app.delete('/api/admin/clear/historial', verifyToken, (req, res) => { run('DELETE FROM historial_cierres'); res.json({ success: true }); });

// ============ INICIAR ============
const PORT = process.env.PORT || 3000;

openDb().then(() => {
    createTables();
    app.listen(PORT, () => {
        console.log('🚀 API SQLite corriendo en puerto ' + PORT);
    });
});
