import React, { useState } from 'react';

export default function Combat({ team, user, setUser }) {
  const playerCard = team[0] || { name: 'Gennin', vidastatus: '600', taistatus: '40', chakrastatus: '200' };
  const [playerHp, setPlayerHp] = useState(parseInt(playerCard.vidastatus) || 1000);
  const [enemyHp, setEnemyHp] = useState(1200);
  const [logs, setLogs] = useState(['Arena pronta para combate!']);
  const [finished, setFinished] = useState(false);

  const handleAttack = (type) => {
    if (finished) return;

    let dmg = type === 'taijutsu' ? (parseInt(playerCard.taistatus) || 50) * 2 : 150;
    let newEnemyHp = Math.max(0, enemyHp - dmg);
    setEnemyHp(newEnemyHp);

    let newLogs = [`Usaste ${type.toUpperCase()} causando ${dmg} de dano!`, ...logs];

    if (newEnemyHp === 0) {
      newLogs = ['🎉 Vitória! Recebeste +300 Ryo!', ...newLogs];
      setFinished(true);
      setUser(prev => ({ ...prev, coins: prev.coins + 300 }));
    } else {
      // Contra-ataque do Inimigo
      let enemyDmg = 40;
      let newPlayerHp = Math.max(0, playerHp - enemyDmg);
      setPlayerHp(newPlayerHp);
      newLogs = [`Inimigo contra-atacou e causou ${enemyDmg} de dano!`, ...newLogs];

      if (newPlayerHp === 0) {
        newLogs = ['💀 Foste derrotado em combate!', ...newLogs];
        setFinished(true);
      }
    }

    setLogs(newLogs);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="grid grid-cols-2 gap-6 bg-slate-900 border border-slate-800 p-6 rounded-2xl">
        {/* Jogador */}
        <div className="text-center space-y-2">
          <span className="text-xs bg-cyan-950 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded">Tu</span>
          <div className="text-6xl my-2">🌀</div>
          <h4 className="font-bold text-slate-100">{playerCard.name}</h4>
          <div className="text-xs text-emerald-400 font-bold">HP: {playerHp}</div>
        </div>

        {/* Inimigo */}
        <div className="text-center space-y-2">
          <span className="text-xs bg-rose-950 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded">Inimigo</span>
          <div className="text-6xl my-2">🥷</div>
          <h4 className="font-bold text-slate-100">Ninja Inimigo</h4>
          <div className="text-xs text-rose-400 font-bold">HP: {enemyHp}</div>
        </div>
      </div>

      {!finished && (
        <div className="flex justify-center space-x-4">
          <button onClick={() => handleAttack('taijutsu')} className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg">
            👊 Taijutsu
          </button>
          <button onClick={() => handleAttack('ninjutsu')} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg">
            🔥 Ninjutsu
          </button>
        </div>
      )}

      {/* Logs do combate */}
      <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl h-36 overflow-y-auto space-y-1 text-xs font-mono text-slate-300">
        {logs.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
}