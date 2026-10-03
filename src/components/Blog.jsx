import { useEffect, useState } from "react";
import { Link } from "react-router";
import { fetchApi } from "../api";
import "./Blog.css";

function Blog() {
  const [blogs, setBlogs] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchApi("blogposts/")
      .then((data) => setBlogs(data.reverse()))
      .catch((error) => {
        console.error("There was an error fetching blog posts:", error);
        setFailed(true);
      });
  }, []);

  return (
    <div className="blog cosmic-bg-bright">
      <title>Blog · Sevan Brodjian</title>
      <div className="bg-overlay-2" />
      <div className="title">Blog</div>
      <div className="blog-container">
        {blogs?.length > 0 ? (
          blogs.map((post) => (
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
          <h2 className="loading">
            {failed ? "Couldn't load posts." : blogs ? "No posts yet." : "Loading..."}
          </h2>
        )}
      </div>
    </div>
  );
}

export default Blog;
