import { useContext } from "react"
import { AuthContext } from "./AuthProvider"
import type { Auth } from "./AuthProvider"

/** Session state + actions; throws outside <AuthProvider>. */
export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error("useAuth must be used within <AuthProvider>")
  return auth
}
