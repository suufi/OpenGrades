# MIT OpenGrades

MIT OpenGrades is a web application designed to provide students with a platform to search for classes, view grade distributions, and access other academic resources. The application leverages Next.js for server-side rendering and React for building the user interface. It also integrates with various APIs and services to provide a seamless user experience.

## Features

- Class search functionality
- Grade distribution charts
- User authentication and authorization
- Responsive design

## Setup Instructions

### Prerequisites

- Node.js (version 18.x)
- Yarn package manager
- Docker (for containerized deployment)
- MongoDB (for database)

### Installation

1. Clone the repository:

```sh
git clone https://github.com/suufi/opengrades.git
cd mit-opengrades
```

2. Install dependencies:

```sh
yarn install
```

3. Create a `.env` file in the root directory and add the following environment variables:

```sh
MONGODB_CONNECTION_URI="your_mongodb_connection_uri"
MIT_OIDC_WELLKNOWN="https://petrock.mit.edu/.well-known/openid-configuration"
MIT_OIDC_CLIENT_ID="your_client_id"
MIT_OIDC_CLIENT_SECRET="your_client_secret"
MIT_OIDC_AUTHORIZATION_ENDPOINT="https://petrock.mit.edu/touchstone/oidc/authorization"
MIT_OIDC_ISSUER="https://petrock.mit.edu"
MIT_API_CLIENT_ID="your_api_client_id"
MIT_API_CLIENT_SECRET="your_api_client_secret"
NEXTAUTH_SECRET="your_nextauth_secret"
NEXTAUTH_URL="your_nextauth_url"
AUTH_TRUST_HOST="true"
```

4. Start the development server:

```sh
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

1. Build the application:

```sh
docker build -t opengrades .
```

2. Run the application:

```sh
docker run -d -p 3000:3000 .env opengrades
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Contributing

We welcome contributions from the community! If you would like to contribute to the project, please refer to the [contributing guidelines](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
