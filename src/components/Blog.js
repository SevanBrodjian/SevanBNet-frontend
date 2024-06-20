import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Blog.css';

function Blog() {
  const [blogs, setBlogs] = useState([]);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/blogposts/`)
      .then(response => response.json())
      .then(data => setBlogs(data.reverse()))
      .catch(error => console.error("There was an error fetching blog posts:", error));
  }, []);

  return (
    <div className="blog cosmic-bg-bright">
      <div className="bg-overlay-2"></div>
      <div className="title">Blog</div>
      <div className="blog-container">
        {blogs.length > 0 ? (
          blogs.map(post => (
            <div className="blog-post-card" key={post.id}>
              <h2 className="post-title">{post.title}</h2>
              <p className="post-description">{post.description}</p>
              <div className="post-link-date">
                <p className="post-date">{new Date(post.published_date).toLocaleDateString()}</p>
                <Link to={`/blog/${post.slug}`}>
                  <button className="post-link-btn">Read More</button>
                </Link>
              </div>
            </div>
          ))
        ) : (
          <h2 className="loading">Loading...</h2>
        )}
      </div>
    </div>
  );
}

export default Blog;
