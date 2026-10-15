# The signed-in user and their agency, matching contracts/openapi/schemas/auth.yaml (Me).
class MeSerializer
  def self.call(user)
    agency = user.agency
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        coordinator_name: user.coordinator_name
      },
      agency: {
        id: agency.id,
        name: agency.name,
        slug: agency.slug,
        timezone: agency.timezone,
        qualified_milestone: agency.qualified_milestone
      }
    }
  end
end
