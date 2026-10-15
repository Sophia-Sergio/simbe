# Serves the one HTML shell; React Router takes over in the browser. The JSON API never goes through here.
class SpaController < ApplicationController
  def index
    expires_now # Cache-Control: no-cache, so the shell always revalidates and asset hashes stay current
    render "spa/index", layout: "application"
  end
end
