import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './BlogPost.css';
import backarrow from '../assets/back_arrow_dark.png';

function BlogPost() {
  const { blogId } = useParams();
  const [blog, setBlog] = useState(null);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/api/blogposts/${blogId}/`)
      .then(response => response.json())
      .then(data => setBlog(data))
      .catch(error => console.error("There was an error fetching the blog post:", error));
  }, [blogId]);

  return (
    <div className="blog-post cosmic-bg-white custom-scroll-dark">
      <div className="bg-overlay-3"></div>
      <div className="static-bg"></div>
      {blog ? (
        <div className="blog-post-container">
          <div className="blog-post-title-container">
            <h1 className="blog-title">{blog.title}</h1>
          </div>
          <div className="blog-content-container">
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: blog.content }}
            />
          </div>
        </div>
      ) : (
        <h2 className="loading">Loading...</h2>
      )}
    </div>
  );
}

export default BlogPost;
