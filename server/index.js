const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Conexão com a base de dados PostgreSQL para atualizar o status do socket
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => console.error('Erro no pool (ligação inativa):', err.message));

// Configuração do Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
  }
});

io.on('connection', async (socket) => {
  const userId = parseInt(socket.handshake.query.userId, 10);

  if (userId) {
    socket.userId = userId;

    try {
      await pool.query("UPDATE users SET status = 'connect' WHERE id_user = $1", [userId]);
      console.log(`Utilizador ${userId} ligado (status: connect)`);
    } catch (err) {
      console.error(`Erro ao atualizar conexão do user ${userId}:`, err);
    }
  }

  socket.on('disconnect', async () => {
    if (socket.userId) {
      try {
        await pool.query("UPDATE users SET status = 'disconnect' WHERE id_user = $1", [socket.userId]);
        console.log(`Utilizador ${socket.userId} desligou-se (status: disconnect)`);
      } catch (err) {
        console.error(`Erro ao atualizar desconexão do user ${socket.userId}:`, err);
      }
    }
  });
});

// Configuração de CORS e suporte a payload Base64 até 50MB
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Importar rotas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gachaRoutes = require('./routes/gachaRoutes');
const adminRoutes = require('./routes/adminRoutes');
const cardRoutes = require('./routes/cardRoutes');
const pvpRoutes = require('./routes/pvpRoutes');

// Registar rotas com os prefixos corretos
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', gachaRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api', pvpRoutes);
app.use('/api', adminRoutes);

const PORT = process.env.PORT || 3000;

// IMPORTANTE: server.listen em vez de app.listen para ativar HTTP + WebSockets na mesma porta
server.listen(PORT, () => console.log(`🚀 Servidor Ninja Legends ativo na porta ${PORT}`));