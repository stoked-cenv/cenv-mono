import React from "react";
import { CenvFeature } from "./cenv-feature";

export const CenvFeatures: React.FC = () => {
  const featuresList = [
    {
      title: "CLI",
      description:
        "CENV is first and foremost a cli. In it's inception it was designed to automate repeatable deployment tasks such as reducing hunan interaction during simple deployments.",
      resourceUrl: "https://github.com/stoked-cenv/cenv-mono",
      icon: "https://cdn.auth0.com/blog/hello-auth0/identity-providers-logo.svg",
    },
    {
      title: "AWS CDK",
      description:
        "CENV piggy backs on top of your aws CLI credentials and wraps your application environment configuration in with them. It harnesses the power of the cdk by providing a simple mechanism to reuse your existing cdk solutions.",
      resourceUrl: "https://github.com/stoked-cenv/cenv-mono",
      icon: "https://cdn.auth0.com/blog/hello-auth0/mfa-logo.svg",
    },
    {
      title: "User Interface",
      description:
        "CENV's `ui` command allows you to visually investigate the components of your local code against their related infrastructure components that are currently deployed in a given environment. Built on top of the amazing \"blessed\" node library all of the UI is displayed to you via your terminal.",
      resourceUrl: "https://github.com/stoked-cenv/cenv-mono",
      icon: "https://cdn.auth0.com/blog/hello-auth0/advanced-protection-logo.svg",
    },
    {
      title: "Isolate Deployment Issues",
      description:
        "Actions are functions that allow you to customize the behavior of Auth0. Each action is bound to a specific triggering event on the Auth0 platform. Auth0 invokes the custom code of these Actions when the corresponding triggering event is produced at runtime.",
      resourceUrl: "https://github.com/stoked-cenv/cenv-mono",
      icon: "https://cdn.auth0.com/blog/hello-auth0/private-cloud-logo.svg",
    },
  ];

  return (
    <div className="cenv-features">
      <h2 className="cenv-features__title">explore cenv features</h2>
      <div className="cenv-features__grid">
        {featuresList.map((feature) => (
          <CenvFeature
            key={feature.resourceUrl}
            title={feature.title}
            description={feature.description}
            resourceUrl={feature.resourceUrl}
            icon={feature.icon}
          />
        ))}
      </div>
    </div>
  );
};
