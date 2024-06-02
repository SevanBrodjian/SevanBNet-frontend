import React, { useEffect, useRef, useState } from 'react';
import { Link } from "react-router-dom";
import { debounce } from 'lodash';
import p5 from 'p5';
import anime from 'animejs/lib/anime.es.js';
import './Home.css';
import logo from '../assets/site-logo.png';
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
      document.querySelectorAll('.animated-path path').forEach(path => {
        const animatePath = () => {
          const newPath = generateRandomCurvedPath();
          anime({
            targets: path,
            d: newPath,
            easing: 'easeInOutSine',
            duration: 4000, // Increased duration for smoother transition
            complete: animatePath, // Recursively call the animation for continuous effect
          });
        };
        animatePath();
      });
    };

    animatePaths();
  }, []);

  const generateRandomCurvedPath = () => {
    const width = 200;
    const height = 60;
    const wobble = 12;
    const points = [
      [width * 1 / 8 + Math.random() * wobble, height / 2 + Math.random() * wobble],
      [width * 2 / 8 + Math.random() * wobble, height / 4 + Math.random() * wobble],
      [width * 3 / 8 + Math.random() * wobble, Math.random() * wobble],
      [width * 4 / 8 + Math.random() * wobble, height / 8 + Math.random() * wobble],
      [width * 5 / 8 + Math.random() * wobble, Math.random() * wobble],
      [width * 6 / 8 + Math.random() * wobble, height / 4 + Math.random() * wobble],
      [width * 7 / 8 + Math.random() * wobble, height / 2 + Math.random() * wobble],
      [width * 6 / 8 + Math.random() * wobble, height * 3 / 4 + Math.random() * wobble],
      [width * 5 / 8 + Math.random() * wobble, height + Math.random() * wobble],
      [width * 4 / 8 + Math.random() * wobble, height * 7 / 8 + Math.random() * wobble],
      [width * 3 / 8 + Math.random() * wobble, height + Math.random() * wobble],
      [width * 2 / 8 + Math.random() * wobble, height * 3 / 4 + Math.random() * wobble],
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
        <div className="welcome-box">
          <img className="homepage-logo" src={logo} alt="Logo" />
          {/* <span className="homepage-msg">SevanB.net</span> */}
        </div>
        <div className="buttons-container">
          <Link to="/projects">
            <svg className="animated-path">
              <path d={generateRandomCurvedPath()} />
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="20">Projects</text>
            </svg>
          </Link>
          <Link to="/blog">
            <svg className="animated-path">
              <path d={generateRandomCurvedPath()} />
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="20">Blog</text>
            </svg>
          </Link>
          <Link to="/about">
            <svg className="animated-path">
              <path d={generateRandomCurvedPath()} />
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="20">About Me</text>
            </svg>
          </Link>
          <button className="home-btn animation-btn" onClick={changeAnimation}>Change Animation</button>
        </div>
      </div>
    </div>
  );
}

export default Home;
