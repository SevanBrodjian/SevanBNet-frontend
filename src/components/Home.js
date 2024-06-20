import React, { useEffect, useRef, useState } from 'react';
import { Link } from "react-router-dom";
import { debounce } from 'lodash';
import p5 from 'p5';
import anime from 'animejs/lib/anime.es.js';
import './Home.css';
// import logo from '../assets/site-logo.png';
import reactionDiffusion from './bg_animations/reactionDiffusion.js';
import differentialGrowth from './bg_animations/differentialGrowth.js';
import particleLife from './bg_animations/particleLife.js';
import particleUniverse from './bg_animations/particleUniverse.js';

function Home() {
  const animations = [reactionDiffusion, reactionDiffusion];
  const [animationIndex, setAnimationIndex] = useState(Math.floor(Math.random() * animations.length));
  const [opacity, setOpacity] = useState(0);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const sketchRef = useRef();
  const p5Instance = useRef(null);
  const numPoints = 6;

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
  }, [animationIndex]);

  useEffect(() => {
    const animatePaths = () => {
      document.querySelectorAll('.animated-path').forEach(svg => {
        const path = svg.querySelector('path');
        const width = svg.clientWidth;
        const height = svg.clientHeight;
        
        // Set an initial path
        path.setAttribute('d', generateRandomCurvedPath(width, height));
  
        const animatePath = () => {
          const newPath = generateRandomCurvedPath(width, height);
          const duration = Math.random() * 3500 + 3500;
          anime({
            targets: path,
            d: newPath,
            easing: 'easeInOutSine',
            duration: duration,
            complete: animatePath,
          });
        };
        animatePath();
      });
  
      document.querySelectorAll('.animated-path text').forEach(text => {
        const svg = text.closest('.animated-path');
        const width = svg.clientWidth;
        const height = svg.clientHeight;
        const floatX = 0.065 * width;
        const floatY = 0.065 * height;
        const randomX = `${Math.random() * floatX - (floatX / 2)}px`;
        const randomY = `${Math.random() * floatY - (floatY / 2)}px`;
        text.style.setProperty('--random-x', randomX);
        text.style.setProperty('--random-y', randomY);
  
        const duration = `${Math.random() * 4000 + 4000}ms`;
        text.style.setProperty('--duration', duration);
      });
    };
  
    animatePaths();
  }, []);
  

  const generateRandomCurvedPath = (fullWidth, fullHeight) => {
    const width = 1.0 * fullWidth;
    const height = 1.0 * fullHeight;
    const offX = (fullWidth - width) / 2;
    const offY = (fullHeight - height) / 2;
    const wobble = Math.min(1 / 5 * height, 1 / 5 * width);
    const points = [
      [offX + Math.random() * wobble,                   offY + height / 2 + Math.random() * wobble],
      [offX + width / 6 + Math.random() * wobble,       offY + height / 6 + Math.random() * wobble],
      [offX + width / 2 + Math.random() * wobble,       offY + Math.random() * wobble],
      [offX + width * 5 / 6 + Math.random() * wobble,   offY + height / 6 + Math.random() * wobble],
      [offX + width + Math.random() * wobble,           offY + height / 2 + Math.random() * wobble],
      [offX + width * 5 / 6 + Math.random() * wobble,   offY + height * 5 / 6 + Math.random() * wobble],
      [offX + width / 2 + Math.random() * wobble,       offY + height + Math.random() * wobble],
      [offX + width * 1 / 6 + Math.random() * wobble,   offY + height * 5 / 6 + Math.random() * wobble],
    ];
  
    let path = `M ${points[0][0]},${points[0][1]}`;
  
    for (let i = 0; i < points.length + 1; i++) {
      const current = points[i % points.length];
      const next = points[(i + 1) % points.length];
      const midPoint = [
        (current[0] + next[0]) / 2,
        (current[1] + next[1]) / 2
      ];
      path += ` Q ${current[0]},${current[1]} ${midPoint[0]},${midPoint[1]}`;
    }
  
    path += ' Z';
  
    return path;
  };

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
        <img className="homepage-logo" src="https://imgur.com/PBnrS8i.png" alt="Logo" />
        <div className="buttons-container">
          <div className="buttons-row">
            <Link to="/projects">
              <svg className="animated-path">
                <path d={generateRandomCurvedPath()} />
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="text-drift">Projects</text>
              </svg>
            </Link>
            <Link to="/blog">
              <svg className="animated-path">
                <path d={generateRandomCurvedPath()} />
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="text-drift">Blog</text>
              </svg>
            </Link>
          </div>
          <div className="buttons-row">
            <Link to="/about">
              <svg className="animated-path">
                <path d={generateRandomCurvedPath()} />
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="text-drift">About Me</text>
              </svg>
            </Link>
            <Link to="#">
              <svg className="animated-path gold" onClick={changeAnimation}>
                <path d={generateRandomCurvedPath()} />
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="text-drift">Change Animation</text>
              </svg>
            </Link>
          </div>
        </div>
      </div>
      <span className="homepage-msg">SevanB.net</span>
    </div>
  );
}

export default Home;
