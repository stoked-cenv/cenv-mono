import React from "react";

export const HeroBanner: React.FC = () => {
  return (
    <div className="hero-banner hero-banner--pink-yellow">

      <video autoPlay className="video-teaser"
             src="https://cenv-public.s3.amazonaws.com/cenv-deploy-curb-cloud.mp4"
             poster="img/cenv-deploy.png"
             width="100%" >
        Sorry, your browser doesn't support embedded videos, but don't worry, you can
        <a href="img/cenv-deploy.png">download it</a>
        and watch it with your favorite video player!
      </video>
      <p className="hero-banner__description">
        <b className="hero-logo">c</b><b className="hero-logo-end">env</b> is a well considered cli and <a href="http://nodejs.org" target="_blank" rel="noreferrer">node.js</a> library for managing applications, infrastructure, and configuration management.
      </p>
      <a
        id="code-sample-link"
        target="_blank"
        rel="noopener noreferrer"
        href="https://github.com/stoked-cenv/cenv-mono/tree/master/example"
        className="button button--secondary"
      >
        check out the example code <b className="tiny"><sup>(hint it's this site)</sup></b> →
      </a>
    </div>
  );
};
