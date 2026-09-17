module.exports = {
  reactStrictMode: true,
  basePath: '/safdjuhos8dfuahj',
  async rewrites() {
    return [{ source: '/api/:path*', destination: process.env.API_URL + '/safdjuhos8dfuahj/:path*' }]
  }
}
