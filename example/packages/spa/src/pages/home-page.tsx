import React from "react";
import { CenvFeatures } from "src/components/cenv-features";
import { HeroBanner } from "src/components/hero-banner";
import { PageLayout } from "../components/page-layout";

export const HomePage: React.FC = () => (
  <PageLayout>
    <>
      <HeroBanner />
      <CenvFeatures />
    </>
  </PageLayout>
);
