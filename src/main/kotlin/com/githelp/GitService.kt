package com.githelp

import java.io.File
import java.util.concurrent.TimeUnit

data class Branch(val name: String, val isCurrent: Boolean, val isLocalOnly: Boolean = false)

data class GitProject(
        val path: String,
        val name: String,
        val branches: List<Branch>,
        val parentBranch: String? = null,
        val isSubmodule: Boolean = false,
        val commitHash: String = "",
        val commitDate: String = ""
)

data class GitStatus(val mainProject: GitProject, val submodules: List<GitProject>)

class GitService {

    fun getGitStatus(path: String): GitStatus {
        println("DEBUG: getGitStatus for $path")
        val rootDir = File(path)
        if (!rootDir.exists() || !File(rootDir, ".git").exists()) {
            println("ERROR: Invalid git project path: $path")
            throw IllegalArgumentException("Invalid git project path: $path")
        }

        val (mainHash, mainDate) = getCommitInfo(rootDir)
        val mainBranches = getBranches(rootDir)
        val currentBranch = mainBranches.find { it.isCurrent }?.name ?: "main"
        val parentBranch = getParentBranch(rootDir, currentBranch)
        val mainProject =
                GitProject(
                        path = path,
                        name = rootDir.name,
                        branches = mainBranches,
                        parentBranch = parentBranch,
                        isSubmodule = false,
                        commitHash = mainHash,
                        commitDate = mainDate
                )

        val submodules = getSubmodules(rootDir)

        val status = GitStatus(mainProject, submodules)
        // println("DEBUG: Status result: $status")
        return status
    }

    private fun getBranches(dir: File): List<Branch> {
        val output = runCommand(dir, "git", "branch", "--no-color", "-vv")
        println(
                "DEBUG: 'git branch' output for ${dir.name} in ${dir.absolutePath}:\n---\n$output\n---"
        )

        val branches =
                output.lines().filter { it.isNotBlank() }.map { line ->
                    val trimmed = line.trim()
                    val isCurrent = trimmed.startsWith("*")
                    val withoutCurrent =
                            if (isCurrent) trimmed.removePrefix("*").trim() else trimmed
                    val name =
                            if (withoutCurrent.startsWith("(")) {
                                withoutCurrent.substringBefore(")") + ")"
                            } else {
                                withoutCurrent.substringBefore(" ")
                            }
                    val rest = withoutCurrent.substringAfter(name).trim()
                    val isLocalOnly = !rest.substringAfter(" ").trim().startsWith("[")
                    Branch(name, isCurrent, isLocalOnly)
                }
        println("DEBUG: Parsed branches: $branches")
        return branches
    }

    private fun getCommitInfo(dir: File): Pair<String, String> {
        try {
            val hash = runCommand(dir, "git", "log", "-1", "--format=%h").trim()
            val date = runCommand(dir, "git", "log", "-1", "--format=%cd", "--date=short").trim()
            return Pair(hash, date)
        } catch (e: Exception) {
            return Pair("", "")
        }
    }

    private fun getSubmodules(rootDir: File): List<GitProject> {
        val output = runCommand(rootDir, "git", "submodule", "status")
        if (output.isBlank()) return emptyList()

        return output.lines().filter { it.isNotBlank() }.map { line ->
            // line format:  -commit_hash_ path (branch_info)
            val parts = line.trim().split(" ")
            val path = parts.getOrElse(1) { "" }
            val submoduleDir = File(rootDir, path)

            val branches = if (submoduleDir.exists()) getBranches(submoduleDir) else emptyList()
            val (subHash, subDate) =
                    if (submoduleDir.exists()) getCommitInfo(submoduleDir) else Pair("", "")
            val currentBranch = branches.find { it.isCurrent }?.name ?: "main"
            val parentBranch =
                    if (submoduleDir.exists()) getParentBranch(submoduleDir, currentBranch)
                    else null

            GitProject(
                    path = submoduleDir.absolutePath,
                    name = path,
                    branches = branches,
                    parentBranch = parentBranch,
                    isSubmodule = true,
                    commitHash = subHash,
                    commitDate = subDate
            )
        }
    }

    private fun getParentBranch(dir: File, currentBranch: String): String {
        if (currentBranch in listOf("main", "master", "develop")) {
            return currentBranch
        }

        try {
            val branchOutput = runCommand(dir, "git", "branch", "--format=%(refname:short)")
            val branches = branchOutput.lines().map { it.trim() }
            if ("main" in branches) return "main"
            if ("master" in branches) return "master"
            if ("develop" in branches) return "develop"
        } catch (e: Exception) {}

        return "main"
    }

    fun performCheckout(path: String, branchName: String, createIfMissing: Boolean = false) {
        println("DEBUG: performCheckout path=$path branch=$branchName create=$createIfMissing")
        val dir = File(path)
        if (createIfMissing) {
            runCommand(dir, "git", "checkout", "-b", branchName)
        } else {
            runCommand(dir, "git", "checkout", branchName)
        }
    }

    fun performMerge(path: String, targetBranch: String) {
        println("DEBUG: performMerge path=$path target=$targetBranch")
        val dir = File(path)
        runCommand(dir, "git", "merge", targetBranch)
    }

    fun createBranch(path: String, branchName: String) {
        println("DEBUG: createBranch path=$path newBranch=$branchName")
        val dir = File(path)
        runCommand(dir, "git", "checkout", "-b", branchName)
    }

    fun performPull(path: String) {
        println("DEBUG: performPull path=$path")
        val dir = File(path)
        runCommand(dir, "git", "pull")
    }

    fun performPush(path: String, setUpstream: Boolean = false) {
        println("DEBUG: performPush path=$path, setUpstream=$setUpstream")
        val dir = File(path)

        if (setUpstream) {
            val branch = runCommand(dir, "git", "rev-parse", "--abbrev-ref", "HEAD").trim()
            if (branch.isEmpty() || branch == "HEAD") {
                throw RuntimeException("Cannot push detached HEAD or missing branch")
            }
            println("DEBUG: Setting upstream to origin $branch")
            runCommand(dir, "git", "push", "-u", "origin", branch)
        } else {
            runCommand(dir, "git", "push")
        }
    }

    private fun runCommand(dir: File, vararg command: String): String {
        println("DEBUG: Executing command: ${command.joinToString(" ")} @ ${dir.absolutePath}")
        try {
            val process =
                    ProcessBuilder(*command)
                            .directory(dir)
                            .redirectOutput(ProcessBuilder.Redirect.PIPE)
                            .redirectError(ProcessBuilder.Redirect.PIPE)
                            .start()

            // Read output first to prevent blocking
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()

            val exited = process.waitFor(10, TimeUnit.SECONDS)
            if (!exited) {
                process.destroy()
                throw RuntimeException("Command timed out: ${command.joinToString(" ")}")
            }

            println("DEBUG: Exit code: ${process.exitValue()}")
            if (process.exitValue() != 0) {
                println("ERROR: Command failed. Output:\n$output\nError:\n$error")
                throw RuntimeException(
                        "Command failed: ${command.joinToString(" ")}\nError: $error"
                )
            }
            return output
        } catch (e: Exception) {
            println("ERROR: Exception running command: $e")
            e.printStackTrace()
            throw RuntimeException("Failed to run command: ${command.joinToString(" ")}", e)
        }
    }
}
