import React, { useEffect, useRef, useState } from 'react';
import p5 from 'p5';
import './App.css';
import testAnimation from './home_animations/testAnimation.js';
import reactionDiffusion from './home_animations/reactionDiffusion.js';

function App() {
  const animations = [testAnimation, reactionDiffusion];
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
        changeAnimation();
      }
    };
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      if (p5Instance.current) {
        p5Instance.current.remove();
      }
    }
  }, []);

  useEffect(() => {
    setOpacity(0);
    const delayBeforeNewAnimation = isFirstLoad ? 0 : 1500;
    if (isFirstLoad) {
      setIsFirstLoad(false);
    }
    const timeoutIdAnimation = setTimeout(() => {
      if (p5Instance.current) {
        p5Instance.current.remove();
      }
      p5Instance.current = new p5(animations[animationIndex], sketchRef.current);
      setOpacity(1);
    }, delayBeforeNewAnimation);
    return () => {
      clearTimeout(timeoutIdAnimation);
    }
  }, [animationIndex]);

  const changeAnimation = () => {
    if (animations.length > 1) {
        setAnimationIndex(currentIndex => {
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * animations.length);
            } while (newIndex === currentIndex);
            setTimeout(() => console.log(newIndex), 0);
            return newIndex;
        });
    }
  };

  const handleMouseDown = () => {
    buttonPressedRef.current = true;
  };

  return (
    <div className="App">
      <div ref={sketchRef} className="background-animation" style={{opacity: opacity}}></div>
      <header className="App-header">
        <button className="animation-btn" onMouseDown={handleMouseDown}>Change Animation</button>
      </header>
    </div>
  );
}

export default App;
