import React from "react";
import { useJsonLd } from "../../utils/seo.js";
import { personSchema } from "../../utils/contentSchema.js";

/**
 * Author bio block for E-E-A-T on content / guide pages.
 * Emits Person JSON-LD for the author.
 */
export default function AuthorBio({ author }) {
  useJsonLd(
    author
      ? personSchema({
          name: author.name,
          jobTitle: author.title,
          description: author.bio,
          credentials: author.credentials,
        })
      : null
  );

  if (!author) return null;
  return (
    <aside className="ip-author" aria-label="About the author">
      <div className="ip-author-avatar" aria-hidden="true">
        {author.initials || author.name?.slice(0, 2).toUpperCase()}
      </div>
      <div className="ip-author-body">
        <div className="ip-author-label">Written by</div>
        <div className="ip-author-name">{author.name}</div>
        {author.title && <div className="ip-author-title">{author.title}</div>}
        {author.credentials && (
          <div className="ip-author-credentials">{author.credentials}</div>
        )}
        {author.bio && <p className="ip-author-bio">{author.bio}</p>}
      </div>
    </aside>
  );
}
