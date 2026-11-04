const gameModel = {
  async findUserById(userId) {
    const client = await pool.connect();
    try {
      // Ajusta 'id_user' se a tua coluna principal se chamar assim na BD
      const userRes = await client.query('SELECT * FROM Users WHERE id_user = $1', [userId]);
      if (userRes.rows.length === 0) return null;
      
      const user = userRes.rows[0];

      // Buscar cartas do inventário associadas ao utilizador
      const cardsRes = await client.query(
        `SELECT c.* FROM Cards c
         JOIN Inventario i ON c.id_card = i.id_card
         WHERE i.id_user = $1`,
        [userId]
      );

      user.cards = cardsRes.rows;
      return user;
    } finally {
      client.release();
    }
  }
};