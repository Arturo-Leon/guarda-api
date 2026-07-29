const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const { createClient } = require('@libsql/client');
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const db = createClient({
    url: 'libsql://guarda-db-arturo-leon.aws-us-east-2.turso.io',
    authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODUxMjc5MjcsImlkIjoiMDE5ZmExZWEtMDYwMS03ZjZjLWE2MmUtN2NlMTc4NGYwOWE2Iiwia2lkIjoiWnNsb29MdW83aDlNeXRhQW9JWllCSWZYcHBnT3Y2UDBuSnJ2S0RkZWNhSSIsInJpZCI6ImRiOGQzOGViLTBkNWEtNDk1Yy1iMDc3LTc2ZjQ0OGFkMWU1MSJ9.tAor3yssKGSRQ5j7szhWcK2mheoj6dmzj8jhnqvcHu96cYPSDdiYhkkFi_VDzjnajFqqPLCGdghemYGFBUVOCA'
});

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
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const result = await db.execute('SELECT * FROM usuarios WHERE username = ?', [username]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Usuario no existe' });
    if (password === user.password) {
        const token = jwt.sign({ id: user.id, username: user.username }, 'secreto');
        res.json({ success: true, token, usuario: { id: user.id, username: user.username, rol: user.rol } });
    } else {
        res.status(401).json({ error: 'Contraseña incorrecta' });
    }
});

// ============ LOCKERS ============
app.get('/api/lockers', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT * FROM lockers ORDER BY codigo');
    res.json({ success: true, lockers: result.rows });
});

app.post('/api/lockers', verifyToken, async (req, res) => {
    const { codigo, tamanio, estado } = req.body;
    const result = await db.execute('INSERT INTO lockers (codigo, tamanio, estado) VALUES (?, ?, ?)', [codigo, tamanio || 'mediano', estado || 'disponible']);
    const idResult = await db.execute('SELECT last_insert_rowid() as id');
    res.json({ success: true, id: idResult.rows[0].id });
});

app.put('/api/lockers/:id', verifyToken, async (req, res) => {
    const { codigo, tamanio, estado } = req.body;
    await db.execute('UPDATE lockers SET codigo = ?, tamanio = ?, estado = ? WHERE id = ?', [codigo, tamanio, estado, req.params.id]);
    res.json({ success: true });
});

app.delete('/api/lockers/:id', verifyToken, async (req, res) => {
    await db.execute('DELETE FROM lockers WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============ CLIENTES ============
app.get('/api/clientes', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT * FROM clientes ORDER BY id');
    res.json({ success: true, clientes: result.rows });
});

app.post('/api/clientes', verifyToken, async (req, res) => {
    const { id, nombre, identificacion, telefono, email, direccion, registros, total_gastado } = req.body;
    if (id) {
        await db.execute('UPDATE clientes SET nombre=?, identificacion=?, telefono=?, email=?, direccion=?, registros=?, total_gastado=? WHERE id=?',
            [nombre, identificacion, telefono || '', email || '', direccion || '', registros || 0, total_gastado || 0, id]);
        res.json({ success: true, id: parseInt(id) });
    } else {
        try {
        const result = await db.execute('INSERT INTO clientes (nombre, identificacion, telefono, email, direccion, registros, total_gastado) VALUES (?,?,?,?,?,?,?)',
        [nombre, identificacion, telefono || '', email || '', direccion || '', registros || 0, total_gastado || 0]);
        } catch (err) {
            if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'El cliente ya existe' });
    }
    throw err;
}
        console.log('📝 INSERT clientes:', nombre, identificacion);
        const idResult = await db.execute('SELECT last_insert_rowid() as id');
        console.log('🆔 Nuevo ID:', idResult.rows[0]?.id);
        res.json({ success: true, id: idResult.rows[0]?.id || 1 });
    }
});

app.delete('/api/clientes/:id', verifyToken, async (req, res) => {
    await db.execute('DELETE FROM clientes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// Crear tablas automáticamente
async function createTables() {
    await db.execute(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, rol TEXT)`);
    await db.execute(`INSERT OR IGNORE INTO usuarios (id, username, password, rol) VALUES (1, 'Administrador', 'admin123', 'administrador')`);
    await db.execute(`CREATE TABLE IF NOT EXISTS lockers (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE, tamanio TEXT, estado TEXT DEFAULT 'disponible')`);
    await db.execute(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, identificacion TEXT UNIQUE, telefono TEXT, email TEXT, direccion TEXT, registros INTEGER DEFAULT 0, total_gastado REAL DEFAULT 0)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS sucursales (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, direccion TEXT, telefono TEXT, email TEXT, activo INTEGER DEFAULT 1, fecha_creacion TEXT)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS configuracion (id INTEGER PRIMARY KEY AUTOINCREMENT, clave TEXT UNIQUE, valor TEXT)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS registros (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_registro TEXT, codigo_equipaje TEXT, locker_id INTEGER, locker_codigo TEXT, tamanio_locker TEXT, cliente_nombre TEXT, cliente_identificacion TEXT, cliente_telefono TEXT, descripcion_equipaje TEXT, fecha TEXT, hora TEXT, monto REAL, estado TEXT DEFAULT 'activo', metodo_pago TEXT, fecha_retiro TEXT, hora_retiro TEXT)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS movimientos_caja (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, concepto TEXT, monto REAL, metodo TEXT, fecha TEXT, hora TEXT, registro TEXT, descripcion TEXT, observaciones TEXT)`);
    await db.execute(`CREATE TABLE IF NOT EXISTS historial_cierres (id INTEGER PRIMARY KEY AUTOINCREMENT, turno INTEGER, fechaApertura TEXT, horaApertura TEXT, fechaCierre TEXT, horaCierre TEXT, montoInicial REAL, ingresos REAL, egresos REAL, pendientes REAL, totalEsperado REAL, arqueoEfectivo REAL, diferencia REAL, estado TEXT, observaciones TEXT, descripcion TEXT)`);
    console.log('✅ Tablas listas');
}
createTables();

// ============ REGISTROS ============
app.get('/api/registros', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT * FROM registros ORDER BY id DESC');
    res.json({ success: true, registros: result.rows });
});

app.post('/api/registros', verifyToken, async (req, res) => {
    const { numero_registro, codigo_equipaje, locker_id, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono, descripcion_equipaje, fecha, hora, monto, estado, metodo_pago } = req.body;
    const result = await db.execute(`INSERT INTO registros (numero_registro, codigo_equipaje, locker_id, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono, descripcion_equipaje, fecha, hora, monto, estado, metodo_pago) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numero_registro, codigo_equipaje, locker_id || 0, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono || '', descripcion_equipaje || '', fecha, hora, monto, estado || 'activo', metodo_pago]);
    if (locker_codigo) {
        await db.execute('UPDATE lockers SET estado = ? WHERE codigo = ?', ['ocupado', locker_codigo]);
    }
    const idResult = await db.execute('SELECT last_insert_rowid() as id');
    res.json({ success: true, id: idResult.rows[0].id });
});

app.post('/api/registros/:id/retirar', verifyToken, async (req, res) => {
    const { fecha_retiro, hora_retiro, metodo_pago, monto } = req.body;
    const row = await db.execute('SELECT locker_codigo FROM registros WHERE id = ?', [req.params.id]);
    if (row.rows[0]?.locker_codigo) {
        await db.execute('UPDATE lockers SET estado = ? WHERE codigo = ?', ['disponible', row.rows[0].locker_codigo]);
    }
    await db.execute('UPDATE registros SET estado = ?, fecha_retiro = ?, hora_retiro = ?, metodo_pago = ?, monto = ? WHERE id = ?',
        ['finalizado', fecha_retiro, hora_retiro, metodo_pago, monto || 0, req.params.id]);
    res.json({ success: true });
});

app.put('/api/registros/:id', verifyToken, async (req, res) => {
    const { monto } = req.body;
    if (monto) await db.execute('UPDATE registros SET monto = ? WHERE id = ?', [monto, req.params.id]);
    res.json({ success: true });
});

// ============ MOVIMIENTOS ============
app.get('/api/movimientos', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT * FROM movimientos_caja ORDER BY id DESC');
    res.json({ success: true, movimientos: result.rows });
});

app.post('/api/movimientos', verifyToken, async (req, res) => {
    const { tipo, concepto, monto, metodo, fecha, hora, registro, descripcion, observaciones } = req.body;
    const result = await db.execute('INSERT INTO movimientos_caja (tipo, concepto, monto, metodo, fecha, hora, registro, descripcion, observaciones) VALUES (?,?,?,?,?,?,?,?,?)',
        [tipo, concepto, monto, metodo, fecha, hora, registro, descripcion || '', observaciones || '']);
    const idResult = await db.execute('SELECT last_insert_rowid() as id');
    res.json({ success: true, id: idResult.rows[0].id });
});

app.put('/api/movimientos/:id', verifyToken, async (req, res) => {
    const { tipo, concepto, monto, metodo, fecha, hora, registro } = req.body;
    await db.execute('UPDATE movimientos_caja SET tipo=?, concepto=?, monto=?, metodo=?, fecha=?, hora=?, registro=? WHERE id=?',
        [tipo, concepto, monto, metodo, fecha, hora, registro, req.params.id]);
    res.json({ success: true });
});

// ============ CIERRES ============
app.get('/api/historial/cierres', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT * FROM historial_cierres ORDER BY id DESC');
    res.json({ success: true, historial: result.rows });
});

app.post('/api/cierre', verifyToken, async (req, res) => {
    const { turno, fechaApertura, horaApertura, fechaCierre, horaCierre, montoInicial, ingresos, egresos, pendientes, totalEsperado, arqueoEfectivo, diferencia, estado, observaciones, descripcion } = req.body;
    const result = await db.execute(`INSERT INTO historial_cierres (turno, fechaApertura, horaApertura, fechaCierre, horaCierre, montoInicial, ingresos, egresos, pendientes, totalEsperado, arqueoEfectivo, diferencia, estado, observaciones, descripcion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [turno, fechaApertura, horaApertura, fechaCierre, horaCierre, montoInicial, ingresos, egresos, pendientes, totalEsperado, arqueoEfectivo, diferencia, estado, observaciones || '', descripcion || '']);
    res.json({ success: true, id: result.lastInsertRowid });
});

// ============ CONFIGURACIÓN ============
app.post('/api/configuracion/precios', verifyToken, async (req, res) => {
    const { configPrecios, tarifasHoras, configPreciosExtra } = req.body;
    await db.execute('DELETE FROM configuracion WHERE clave = ?', ['configPrecios']);
    await db.execute('INSERT INTO configuracion (clave, valor) VALUES (?, ?)', ['configPrecios', JSON.stringify(configPrecios)]);
    await db.execute('DELETE FROM configuracion WHERE clave = ?', ['tarifasHoras']);
    await db.execute('INSERT INTO configuracion (clave, valor) VALUES (?, ?)', ['tarifasHoras', JSON.stringify(tarifasHoras)]);
    await db.execute('DELETE FROM configuracion WHERE clave = ?', ['configPreciosExtra']);
    await db.execute('INSERT INTO configuracion (clave, valor) VALUES (?, ?)', ['configPreciosExtra', JSON.stringify(configPreciosExtra || {})]);
    res.json({ success: true });
});

app.get('/api/configuracion/precios', verifyToken, async (req, res) => {
    const result = await db.execute(`SELECT clave, valor FROM configuracion WHERE clave IN ('configPrecios', 'tarifasHoras', 'configPreciosExtra')`);
    const configuracion = {};
    result.rows.forEach(r => { try { configuracion[r[0]] = JSON.parse(r[1]); } catch(e) {} });
    res.json({ success: true, configuracion });
});

app.post('/api/configuracion/sistema', verifyToken, async (req, res) => {
    const { configSistema } = req.body;
    const cleanConfig = JSON.parse(JSON.stringify(configSistema));
    await db.execute('DELETE FROM configuracion WHERE clave = ?', ['configSistema']);
    await db.execute('INSERT INTO configuracion (clave, valor) VALUES (?, ?)', ['configSistema', JSON.stringify(cleanConfig)]);
    res.json({ success: true });
});

app.get('/api/configuracion/sistema', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT valor FROM configuracion WHERE clave = ?', ['configSistema']);
    let config = null;
    if (result.rows.length > 0) {
        try { config = JSON.parse(result.rows[0][0]); } catch(e) {}
    }
    res.json({ success: true, configSistema: config });
});

// ============ SUCURSALES ============
app.get('/api/sucursales', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT * FROM sucursales ORDER BY id');
    res.json({ success: true, sucursales: result.rows });
});

app.post('/api/sucursales', verifyToken, async (req, res) => {
    const { id, nombre, direccion, telefono, email, activo } = req.body;
    if (id) {
        await db.execute('UPDATE sucursales SET nombre=?, direccion=?, telefono=?, email=?, activo=? WHERE id=?', [nombre, direccion, telefono, email, activo, id]);
        res.json({ success: true });
    } else {
        const result = await db.execute('INSERT INTO sucursales (nombre, direccion, telefono, email, activo) VALUES (?,?,?,?,?)', [nombre, direccion, telefono, email, activo || 1]);
        const idResult = await db.execute('SELECT last_insert_rowid() as id');
        res.json({ success: true, id: idResult.rows[0].id });
    }
});

app.delete('/api/sucursales/:id', verifyToken, async (req, res) => {
    await db.execute('DELETE FROM sucursales WHERE id = ?', [req.params.id]);
    res.json({ success: true });
});

// ============ USUARIOS ============
app.get('/api/usuarios', verifyToken, async (req, res) => {
    const result = await db.execute('SELECT id, nombre, username, rol, activo, fecha_creacion FROM usuarios ORDER BY id');
    res.json({ success: true, usuarios: result.rows });
});

app.post('/api/usuarios', verifyToken, async (req, res) => {
    const { id, nombre, username, password, rol, activo } = req.body;
    if (id) {
        if (password) await db.execute('UPDATE usuarios SET nombre=?, username=?, password=?, rol=?, activo=? WHERE id=?', [nombre, username, password, rol, activo, id]);
        else await db.execute('UPDATE usuarios SET nombre=?, username=?, rol=?, activo=? WHERE id=?', [nombre, username, rol, activo, id]);
        res.json({ success: true });
    } else {
        const result = await db.execute('INSERT INTO usuarios (nombre, username, password, rol, activo, fecha_creacion) VALUES (?,?,?,?,?,?)', [nombre, username, password || 'admin123', rol || 'operador', activo || 1, new Date().toLocaleDateString()]);
        const idResult = await db.execute('SELECT last_insert_rowid() as id');
        res.json({ success: true, id: idResult.rows[0].id });
    }
});

app.delete('/api/usuarios/:id', verifyToken, async (req, res) => {
    await db.execute('DELETE FROM usuarios WHERE id = ? AND username != ?', [req.params.id, 'Administrador']);
    res.json({ success: true });
});

// ============ MANTENIMIENTO ============
app.delete('/api/admin/clear/clientes', verifyToken, async (req, res) => { await db.execute('DELETE FROM clientes'); res.json({ success: true }); });
app.delete('/api/admin/clear/lockers', verifyToken, async (req, res) => { await db.execute('DELETE FROM lockers'); res.json({ success: true }); });
app.delete('/api/admin/clear/registros', verifyToken, async (req, res) => { await db.execute('DELETE FROM registros'); res.json({ success: true }); });
app.delete('/api/admin/clear/movimientos', verifyToken, async (req, res) => { await db.execute('DELETE FROM movimientos_caja'); res.json({ success: true }); });
app.delete('/api/admin/clear/historial', verifyToken, async (req, res) => { await db.execute('DELETE FROM historial_cierres'); res.json({ success: true }); });

// ============ FRONTEND ============
app.use(express.static(path.join(__dirname, 'frontend')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ============ INICIAR ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 API corriendo en puerto ' + PORT);
});