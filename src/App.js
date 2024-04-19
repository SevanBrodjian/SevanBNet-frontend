import React, { useEffect, useRef, useState } from 'react';
import p5 from 'p5';
import './App.css';
import homeAnimation1 from './homeAnimation1';
import homeAnimation2 from './homeAnimation2';
import homeAnimation3 from './homeAnimation3';
import homeAnimation4 from './homeAnimation4';
import homeAnimation5 from './homeAnimation5';

function App() {
  const animations = [homeAnimation1, homeAnimation2];
  const [animationIndex, setAnimationIndex] = useState(Math.floor(Math.random() * animations.length));
  const [opacity, setOpacity] = useState(1);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const sketchRef = useRef();
  const p5Instance = useRef(null);
  const buttonPressedRef = useRef(false);

  useEffect(() => {
    const handleMouseUp = () => {
      if (buttonPressedRef.current) {
        buttonPressedRef.current = false;
        changeAnimation();  // Change animation if the button was initially pressed
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);  // Only attach this listener once

  useEffect(() => {
    setOpacity(0);
    const timeoutIdAnimation = setTimeout(() => {
      if (p5Instance.current) {
        p5Instance.current.remove();
      }
      const delayBeforeNewAnimation = isFirstLoad ? 0 : 1000;
      setTimeout(() => {
        p5Instance.current = new p5(animations[animationIndex], sketchRef.current);
        setOpacity(1);
        setIsFirstLoad(false);
      }, delayBeforeNewAnimation);
    }, 500);
    return () => clearTimeout(timeoutIdAnimation);
  }, [animationIndex]);

  const changeAnimation = () => {
    if (animations.length > 1) {
        setAnimationIndex(currentIndex => {
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * animations.length);
            } while (newIndex === currentIndex);
            setTimeout(() => console.log(newIndex), 0);  // Log the new index after state updates
            return newIndex;
        });
    }
};


  const handleMouseDown = () => {
    buttonPressedRef.current = true;
  };

  return (
    <div className="App">
      <div ref={sketchRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', opacity: opacity, transition: 'opacity 1s ease' }}></div>
      <header className="App-header">
        <button className="animation-btn" onMouseDown={handleMouseDown}>Change Animation</button>
      </header>
    </div>
  );
}

export default App;
