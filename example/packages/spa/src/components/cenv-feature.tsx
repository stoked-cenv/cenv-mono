import React from "react";

interface Auth0FeatureProps {
  title: string;
  description: string;
  resourceUrl: string;
  icon: string;
}

export const CenvFeature: React.FC<Auth0FeatureProps> = ({
  title,
  description,
  resourceUrl,
  icon,
}) => (
  <a
    href={resourceUrl}
    className="feature"
    target="_blank"
    rel="noopener noreferrer"
  >
    <h3 className="feature__headline">
      <img
        className="feature__icon"
        src={icon}
        alt="external link icon"
      />
      {title}
    </h3>
    <p className="feature__description">{description}</p>
  </a>
);
