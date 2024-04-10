import React, { useEffect, useState, useRef } from 'react';
import p5 from 'p5';
import logo from './logo.svg';
import homeAnimation from './homeAnimation';
import './App.css';

function App() {
  const [numBlogPosts, setNumBlogPosts] = useState(0);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/blogposts/`)
      .then(response => response.json())
      .then(data => {
        setNumBlogPosts(data.length);
      })
      .catch(error => console.error("There was an error fetching the blog posts:", error));
  }, []);

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
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          TEST - Hello World! There are {numBlogPosts} blog posts.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
      <p>TEST TEST</p>
    </div>
  );
}

export default App;
