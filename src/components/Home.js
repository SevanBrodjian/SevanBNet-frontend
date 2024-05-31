import React, { useEffect, useRef, useState } from 'react';
import { Link } from "react-router-dom";
import { debounce } from 'lodash';
import p5 from 'p5';
import './Home.css';
import logo from '../assets/favicon.ico';
import reactionDiffusion from './bg_animations/reactionDiffusion.js';
import differetialGrowth from './bg_animations/differentialGrowth.js';
import particleLife from './bg_animations/particleLife.js';
import particleUniverse from './bg_animations/particleUniverse.js';

function Home() {
  const animations = [reactionDiffusion, reactionDiffusion];
  const [animationIndex, setAnimationIndex] = useState(Math.floor(Math.random() * animations.length));
  const [opacity, setOpacity] = useState(0);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const sketchRef = useRef();
  const p5Instance = useRef(null);

  useEffect(() => {
    const cleanupP5 = () => {
      if (p5Instance.current) {
        p5Instance.current.remove();
        p5Instance.current = null;
      }
    };

    return cleanupP5;
  }, []);

  const setOpacityDebounced = useRef(debounce(newOpacity => {
    setOpacity(newOpacity);
  }, 100)).current;
  
  useEffect(() => {
    const setupP5 = () => {
      cleanupP5();
      p5Instance.current = new p5(animations[animationIndex], sketchRef.current);
      setOpacityDebounced(1);
    };

    const cleanupP5 = () => {
      if (p5Instance.current) {
        p5Instance.current.remove();
        p5Instance.current = null;
      }
    };

    setOpacityDebounced(0);
    const delayBeforeNewAnimation = isFirstLoad ? 0 : 1500;

    if (isFirstLoad) {
      setIsFirstLoad(false);
    }

    const timeoutIdAnimation = setTimeout(setupP5, delayBeforeNewAnimation);
    
    return () => {
      clearTimeout(timeoutIdAnimation);
    }
  }, [animationIndex, setOpacityDebounced, isFirstLoad]);
  

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

  return (
    <div className="home">
      <div ref={sketchRef} className="background-animation" style={{ opacity: opacity }}></div>
      <div className="home-content">
        <div className="welcome-box">
          <img className="homepage-logo" src={logo} alt="Logo" />
          <span className="homepage-msg">Welcome to SevanB.net</span>
        </div>
        <div className="buttons-container">
          <Link to="/projects"><button className="home-btn">Projects</button></Link>
          <Link to="/blog"><button className="home-btn">Blog</button></Link>
          <Link to="/about"><button className="home-btn">About Me</button></Link>
          <button className="home-btn animation-btn" onClick={changeAnimation}>Change Animation</button>
        </div>
      </div>
    </div>
  );
}

export default Home;
