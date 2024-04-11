import React, { useEffect, useRef } from 'react';
import p5 from 'p5';
import homeAnimation from './homeAnimation';
import './App.css';

function App() {

  const sketchRef = useRef();
  useEffect(() => {
    new p5(homeAnimation, sketchRef.current);
  }, []);

  return (
    <div className="App">
      {/* Dedicated div for p5 sketch, ensuring it's behind all other content */}
      <div ref={sketchRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }}></div>
      
      {/* The rest of your app content goes here, styled to be on top of the background */}
      <header className="App-header">
      </header>
    </div>
  );
}

export default App;