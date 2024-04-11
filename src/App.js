import React, { useState, useEffect, useRef } from 'react';
import p5 from 'p5';
import homeAnimation from './homeAnimation';
import './App.css';

function App() {
  const sketchRef = useRef();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    new p5(homeAnimation, sketchRef.current);
  }, []);

  return (
    <div className="App">
      <div ref={sketchRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}></div>
      <header>
        <div className={`circle ${isExpanded ? "expanded" : ""}`} onClick={() => setIsExpanded(!isExpanded)}></div>
      </header>
    </div>
  );
}

export default App;
