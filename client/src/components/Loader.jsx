import React from 'react';
import '../styles/loader.css';

export default function Loader({ text = "A abrir pergaminhos..." }) {
  return (
    <div className="loader-overlay">
      <div className="loader-container">
        <div className="spinner"></div>
        <p className="loader-text">{text}</p>
      </div>
    </div>
  );
}