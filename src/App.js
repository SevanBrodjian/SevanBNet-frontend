import React, { useEffect, useState } from 'react';
import logo from './logo.svg';
import './App.css';

function App() {
  const [numBlogPosts, setNumBlogPosts] = useState(0);
  console.log(process.env.REACT_APP_API_URL);
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/blogposts/`)
      .then(response => response.json())
      .then(data => {
        setNumBlogPosts(data.length);
      })
      .catch(error => console.error("There was an error fetching the blog posts:", error));
  }, []);

  return (
    <div className="App">
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
    </div>
  );
}

export default App;
