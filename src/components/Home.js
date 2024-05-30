import React, { useEffect, useRef, useState } from 'react';
import { debounce } from 'lodash';
import p5 from 'p5';
import './Home.css';
import reactionDiffusion from './home_animations/reactionDiffusion.js';
import differetialGrowth from './home_animations/differentialGrowth.js';
import particleLife from './home_animations/particleLife.js';
import particleUniverse from './home_animations/particleUniverse.js';

function Home() {
  const animations = [reactionDiffusion, reactionDiffusion];
  const [animationIndex, setAnimationIndex] = useState(Math.floor(Math.random() * animations.length));
  const [opacity, setOpacity] = useState(0);
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

  const setOpacityDebounced = useRef(debounce(newOpacity => {
    setOpacity(newOpacity);
  }, 100)).current;
  
  useEffect(() => {
    setOpacityDebounced(0);
    const delayBeforeNewAnimation = isFirstLoad ? 0 : 1500;
    if (isFirstLoad) {
      setIsFirstLoad(false);
    }
    const timeoutIdAnimation = setTimeout(() => {
      if (p5Instance.current) {
        p5Instance.current.remove();
      }
      p5Instance.current = new p5(animations[animationIndex], sketchRef.current);
      setOpacityDebounced(1);
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
            return newIndex;
        });
    }
  };

  const handleMouseDown = () => {
    buttonPressedRef.current = true;
  };

  return (
    <div className="home">
      <div ref={sketchRef} className="background-animation" style={{opacity: opacity}}></div>
      <div className="home-content">
        <button className="animation-btn" onMouseDown={handleMouseDown}>Change Animation</button>
      </div>
    </div>
  );
}

export default Home;
