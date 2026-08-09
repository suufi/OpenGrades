import type { GetServerSideProps, NextPage } from 'next'

const FavoritesRedirect: NextPage = () => null

export const getServerSideProps: GetServerSideProps = async () => {
    return {
        redirect: {
            destination: '/classes?view=favorites',
            permanent: false,
        },
    }
}

export default FavoritesRedirect
