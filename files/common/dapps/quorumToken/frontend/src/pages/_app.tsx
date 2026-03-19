
import type { AppProps } from "next/app";
import { ChakraProvider } from "@chakra-ui/react";
import "../../styles/globals.css";
import Layout from '../components/Layout';

/**
 *
 * @param root0
 * @param root0.Component
 * @param root0.pageProps
 * @param root0.router
 */
function MyApp({ Component, pageProps, router }: AppProps) {

  return (
    <ChakraProvider>
      <title>Besu Quickstart DApp</title>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </ChakraProvider>
  );
}

export default MyApp;
