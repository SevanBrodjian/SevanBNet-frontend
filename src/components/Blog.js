import React, { useState, useEffect } from 'react';
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
    <div className="blog cosmic-bw-bg">
      <div className="static-bg"></div>
      <div className="bg-overlay-1"></div>
      <div className="title">
        <p>Blog</p>
      </div>
      <div className="posts-section">
        <div className="posts-container">
          {blogs.length > 0 ? (
            blogs.map(post => (
              <div className="blog-post" key={post.id}>
                <h2 className="post-title">{post.title}</h2>
                <p className="post-date">{new Date(post.published_date).toLocaleDateString()}</p>
                <p className="post-description">{post.description}</p>
                {post.image && (
                  <img src={post.image} alt={post.title} className="post-image" />
                )}
                <a className="post-link" href={post.get_absolute_url}>Read More</a>
              </div>
            ))
          ) : (
            <p>Error: No blog posts found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Blog;
