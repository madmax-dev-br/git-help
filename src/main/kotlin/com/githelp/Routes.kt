package com.githelp

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.*
import io.ktor.server.html.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.html.*

data class ProjectPathRequest(val path: String)

data class CheckoutRequest(
        val path: String,
        val branch: String,
        val createIfMissing: Boolean = false
)

data class CreateBranchRequest(
        val path: String,
        val branch: String,
        val baseBranch: String? = null
)

data class PullRequest(val path: String, val branch: String? = null)

data class PushRequest(
        val path: String,
        val branch: String? = null,
        val setUpstream: Boolean = false
)

data class MergeRequest(val path: String, val branch: String, val targetBranch: String? = null)

fun Application.configureRoutes() {
    val gitService = GitService()

    routing {
        get("/git-help") { call.respondHtml { gitHelpPage() } }

        route("/api/git") {
            post("/status") {
                try {
                    val req = call.receive<ProjectPathRequest>()
                    println("API: /status requested for ${req.path}")
                    val status = gitService.getGitStatus(req.path)
                    call.respond(status)
                } catch (e: Exception) {
                    println("API Error in /status: ${e.message}")
                    e.printStackTrace()
                    call.respond(HttpStatusCode.BadRequest, e.message ?: "Error")
                }
            }

            post("/checkout") {
                try {
                    val req = call.receive<CheckoutRequest>()
                    println("API: /checkout requested for ${req.path} -> ${req.branch}")
                    gitService.performCheckout(req.path, req.branch, req.createIfMissing)
                    call.respond(HttpStatusCode.OK)
                } catch (e: Exception) {
                    println("API Error in /checkout: ${e.message}")
                    e.printStackTrace()
                    call.respond(HttpStatusCode.InternalServerError, e.message ?: "Error")
                }
            }

            post("/create-branch") {
                try {
                    val req = call.receive<CreateBranchRequest>()
                    println("API: /create-branch requested for ${req.path} -> ${req.branch}")
                    gitService.createBranch(req.path, req.branch, req.baseBranch)
                    call.respond(HttpStatusCode.OK)
                } catch (e: Exception) {
                    println("API Error in /create-branch: ${e.message}")
                    e.printStackTrace()
                    call.respond(HttpStatusCode.InternalServerError, e.message ?: "Error")
                }
            }

            post("/merge") {
                try {
                    val req = call.receive<MergeRequest>()
                    println(
                            "API: /merge requested for ${req.path} source=${req.branch} target=${req.targetBranch}"
                    )
                    gitService.performMerge(req.path, req.branch, req.targetBranch)
                    call.respond(HttpStatusCode.OK)
                } catch (e: Exception) {
                    println("API Error in /merge: ${e.message}")
                    e.printStackTrace()
                    call.respond(HttpStatusCode.InternalServerError, e.message ?: "Error")
                }
            }

            post("/pull") {
                try {
                    val req = call.receive<PullRequest>()
                    println("API: /pull requested for ${req.path} branch=${req.branch}")
                    gitService.performPull(req.path, req.branch)
                    call.respond(HttpStatusCode.OK)
                } catch (e: Exception) {
                    println("API Error in /pull: ${e.message}")
                    e.printStackTrace()
                    call.respond(HttpStatusCode.InternalServerError, e.message ?: "Error")
                }
            }

            post("/push") {
                try {
                    val req = call.receive<PushRequest>()
                    println(
                            "API: /push requested for ${req.path} branch=${req.branch}, setUpstream=${req.setUpstream}"
                    )
                    gitService.performPush(req.path, req.branch, req.setUpstream)
                    call.respond(HttpStatusCode.OK)
                } catch (e: Exception) {
                    println("API Error in /push: ${e.message}")
                    e.printStackTrace()
                    call.respond(HttpStatusCode.InternalServerError, e.message ?: "Error")
                }
            }
            post("/fetch") {
                try {
                    val req = call.receive<ProjectPathRequest>()
                    println("API: /fetch requested for ${req.path}")
                    gitService.performFetch(req.path)
                    call.respond(HttpStatusCode.OK)
                } catch (e: Exception) {
                    println("API Error in /fetch: ${e.message}")
                    e.printStackTrace()
                    call.respond(HttpStatusCode.InternalServerError, e.message ?: "Error")
                }
            }
        }
    }
}
