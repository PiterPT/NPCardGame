import React from 'react';
import PlayerResultCard from './PlayerResultCard';

export default function BattleResultModal({ battle, onClose }) {
  const attackerWon = battle.winnerId === battle.attacker.id;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pvp-modal-title">
        <h3 className="modal-title" id="pvp-modal-title">⚔️ Resultado da Batalha</h3>
        <div className="modal-battle">
          <PlayerResultCard side={battle.attacker} isWinner={attackerWon} />
          <div className="pvp-vs" aria-hidden="true">VS</div>
          <PlayerResultCard side={battle.defender} isWinner={!attackerWon} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
