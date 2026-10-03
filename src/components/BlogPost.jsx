import DOMPurify from "dompurify";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { fetchApi } from "../api";
import { NAME, pageTitle } from "../site";
import { NoIndex } from "./NotFound";
import "./BlogPost.css";

function BlogPost() {
  const { blogId } = useParams();
  const [blog, setBlog] = useState(null);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetchApi(`blogposts/${blogId}/`)
      .then(setBlog)
      .catch((error) => {
        console.error("There was an error fetching the blog post:", error);
        setFailed(true);
        // Only a confirmed 404 is noindexed; an API outage must not de-index real pages.
        setMissing(error.status === 404);
      });
  }, [blogId]);

  return (
    <div className="blog-post cosmic-bg-white blog-scroll">
      <div className="bg-overlay-3"></div>
      <div className="static-bg"></div>
      {blog ? (
        <div className="blog-post-container">
          <title>{pageTitle(blog.title)}</title>
          <div className="blog-post-title-container">
            <h1 className="blog-title">{blog.title}</h1>
          </div>
          <div className="blog-content-container">
            <div
              className="blog-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(blog.content) }}
            />
          </div>
        </div>
      ) : (
        <h2 className="loading">
          <title>{missing ? pageTitle("Not found") : NAME}</title>
          {missing && <NoIndex />}
          {missing ? "Not found." : failed ? "Couldn't load this post." : "Loading..."}
        </h2>
      )}
    </div>
  );
}

export default BlogPost;
