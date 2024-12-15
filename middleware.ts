// import { auth } from "@/utils/auth"
export { default } from "next-auth/middleware"

// export default auth((req) => {
//   if (!req.auth) {
//     const url = req.url.replace(req.nextUrl.pathname, "/login")
//     return Response.redirect(url)
//   }

//   if (req.nextUrl.pathname === "/settings" || req.nextUrl.pathname === "/reports") {
//     if (req.auth.user.trustLevel !== 2) {
//       return Response.redirect("/")
//     }
//   }
// })

// More on how NextAuth.js middleware works: https://next-auth.js.org/configuration/nextjs#middleware
// export default withAuth({
//   callbacks: {
//     authorized ({ req, token }) {
//       // `/admin` requires admin role
//       console.log(token)
//       if (req.nextUrl.pathname === '/settings') {
//         return token?.user.trustLevel === 2
//       }
//       // `/me` only requires the user to be logged in
//       return !!token
//     }
//   }
// })

export const config = { matcher: ['/classes', '/classes(.*)', '/settings', '/leaderboard', '/auditlogs', '/reports'] }
