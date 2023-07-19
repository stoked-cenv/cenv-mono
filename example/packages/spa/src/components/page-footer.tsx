import React from "react";
import { Auth0Resource } from "../models/auth0-resource";
import { PageFooterHyperlink } from "./page-footer-hyperlink";

export const PageFooter = () => {
  const resourceList: Auth0Resource[] = [
    {
      path: "https://auth0.com/why-auth0/",
      label: "why cenv",
    },
    {
      path: "https://auth0.com/docs/get-started",
      label: "how it works",
    },
    {
      path: "https://auth0.com/blog/developers/",
      label: "developer blog",
    },
    {
      path: "https://auth0.com/contact-us",
      label: "contact an expert",
    },
  ];

  return (
    <>
      <div className="">
        <div className="">

          <PageFooterHyperlink path="https://auth0.com/">
            <img
              src="img/stoked-logo.svg"
              alt="Auth0"
              height="100"
            />
          </PageFooterHyperlink>
        </div>
      </div>
    <footer className="page-footer">

      <div className="page-footer-grid">
        <div className="page-footer-grid__info">
          <div className="page-footer-info__message">
            <p className="page-footer-message__headline">
              <span><b>cenv</b> is brought to you by&nbsp;</span>
              <PageFooterHyperlink path="https://stokedconsulting.com/">
                <>Stoked Consulting</>
              </PageFooterHyperlink>
            </p>
            <p className="page-footer-message__description">
              <PageFooterHyperlink path="https://github.com/stoked-cenv/cenv-mono">
                <>
                  <span>
                    Use pre-existing deployment strategies and focus on development instead of devops. Deploy anything
                  </span> <u>in no time!</u>
                </>
              </PageFooterHyperlink>
            </p>
          </div>
          <div className="page-footer-info__button">
            <a
              id="create-account-button"
              className="button button--secondary"
              href="https://auth0.com/signup"
              target="_blank"
              rel="noreferrer noopener"
            >
              create cenv account
            </a>
          </div>
          <div className="page-footer-info__resource-list">
            {resourceList.map((resource) => (
              <div
                key={resource.path}
                className="page-footer-info__resource-list-item"
              >
                <PageFooterHyperlink path={resource.path}>
                  <>{resource.label}</>
                </PageFooterHyperlink>
              </div>
            ))}
          </div>
        </div>

      </div>
    </footer>
    </>
  );
};
