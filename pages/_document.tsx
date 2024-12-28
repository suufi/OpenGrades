import { ColorSchemeScript } from '@mantine/core'
import { createGetInitialProps } from '@mantine/next'
import { GoogleAnalytics } from '@next/third-parties/google'
import Document, { Head, Html, Main, NextScript } from 'next/document'

const getInitialProps = createGetInitialProps()

export default class _Document extends Document {
  static getInitialProps = getInitialProps

  render () {
    return (
      <Html>
        <Head>
          <ColorSchemeScript defaultColorScheme='auto' />
        </Head>
        <body>
          <Main />
          <NextScript />
          <GoogleAnalytics gaId='"G-2EWKT6ED8T"' />
        </body>
      </Html>
    )
  }
}
