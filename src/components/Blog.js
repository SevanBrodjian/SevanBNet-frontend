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
    <div className="blog">
      <div className="container-fluid d-flex justify-content-center">
        <h1 className="display-1"><strong>Blog</strong></h1>
      </div>
      <div className="container">
        {blogs.length > 0 ? (
          blogs.map(post => (
            <div className="blog_post" key={post.id}>
              <h2 className="post-title">{post.title}</h2>
              <p className="post-date">{new Date(post.published_date).toLocaleDateString()}</p>
              <p className="post-description">{post.description}</p>
              {post.image && (
                <img src={post.image} alt={post.title} className="post-image" />
              )}
              <a className="read-more" href={post.get_absolute_url}>Read More</a>
            </div>
          ))
        ) : (
          <p>Error: No blog posts found.</p>
        )}
      </div>
    </div>
  );
}

export default Blog;
