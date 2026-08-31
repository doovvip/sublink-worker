package xyz.kejiyu.hongguo.hooks

/**
 * HongGuo compatibility resolver.
 *
 * Goal:
 * - Keep all original Hook behavior untouched.
 * - Prefer exact version mapping when available.
 * - For unknown patch/minor builds, probe known obfuscation profiles at runtime.
 * - Fall back safely instead of hard-failing only because versionName changed.
 */
object CompatTargetResolver {

    data class Match(
        val names: TargetNames.Names,
        val score: Int,
        val reason: String,
    )

    fun resolve(pkg: String, versionName: String?, classLoader: ClassLoader?): TargetNames.Names {
        if (pkg == TargetNames.OVERSEA_PACKAGE) {
            return resolveOversea(versionName, classLoader)
        }
        if (pkg != TargetNames.CN_PACKAGE) {
            return TargetNames.CN
        }

        val normalized = normalizeVersion(versionName)

        // Exact mappings always win.
        when (normalized) {
            "7.3.3.18" -> return TargetNames.CN_73318
            "7.3.2.32" -> return TargetNames.CN_73232
            "7.3.1.32" -> return TargetNames.CN_73132
        }

        if (classLoader == null) {
            // Unknown version but no runtime probe possible: prefer latest known CN profile.
            return TargetNames.CN_73318
        }

        val candidates = listOf(
            TargetNames.CN_73318,
            TargetNames.CN_73232,
            TargetNames.CN_73132,
        )

        val best = candidates
            .map { scoreProfile(it, classLoader) }
            .maxByOrNull { it.score }

        return if (best != null && best.score >= MIN_CONFIDENCE_SCORE) {
            best.names
        } else {
            // Preserve original behavior as final fallback.
            TargetNames.namesFor(pkg, versionName, classLoader)
        }
    }

    private fun resolveOversea(versionName: String?, classLoader: ClassLoader?): TargetNames.Names {
        val normalized = normalizeVersion(versionName)
        if (normalized == "7.3.1.32" || classLoader == null) return TargetNames.OVERSEA_73132

        val match = scoreProfile(TargetNames.OVERSEA_73132, classLoader)
        return if (match.score >= MIN_CONFIDENCE_SCORE) match.names else TargetNames.OVERSEA_73132
    }

    fun diagnose(pkg: String, versionName: String?, classLoader: ClassLoader?): List<Match> {
        if (classLoader == null) return emptyList()
        return if (pkg == TargetNames.OVERSEA_PACKAGE) {
            listOf(scoreProfile(TargetNames.OVERSEA_73132, classLoader))
        } else {
            listOf(
                scoreProfile(TargetNames.CN_73318, classLoader),
                scoreProfile(TargetNames.CN_73232, classLoader),
                scoreProfile(TargetNames.CN_73132, classLoader),
            ).sortedByDescending { it.score }
        }
    }

    private fun scoreProfile(names: TargetNames.Names, cl: ClassLoader): Match {
        var score = 0
        val hits = mutableListOf<String>()

        fun hit(weight: Int, label: String) {
            score += weight
            hits += label
        }

        val holder = loadClass(names.shortHolder, cl)
        if (holder != null) {
            hit(5, "shortHolder")
            if (hasMethod(holder, names.shortStateMethod)) hit(3, "shortStateMethod")
            if (hasMethod(holder, names.shortMaskMethod)) hit(2, "shortMaskMethod")
            if (hasMethod(holder, names.shortControlsMethod)) hit(2, "shortControlsMethod")
            if (hasMethod(holder, names.shortConfigMethod)) hit(1, "shortConfigMethod")
            if (hasMethod(holder, names.shortLandscapeMethod)) hit(1, "shortLandscapeMethod")
        }

        if (loadClass(names.holderBaseS1, cl) != null) hit(2, "holderBaseS1")
        if (loadClass(names.toolbarBase, cl) != null) hit(1, "toolbarBase")
        if (loadClass(names.pauseAdEntryClass, cl) != null) hit(2, "pauseAdEntry")

        val resolution = loadClass(names.resolutionController, cl)
        if (resolution != null) {
            hit(3, "resolutionController")
            if (names.resolutionModelMethods.any { hasMethod(resolution, it) }) {
                hit(2, "resolutionModelMethod")
            }
            if (hasField(resolution, names.resolutionEngineField)) {
                hit(1, "resolutionEngineField")
            }
        }

        if (loadClass(names.kmpVipModel, cl) != null) hit(3, "kmpVipModel")
        if (names.kmpAcctService.any { loadClass(it, cl) != null }) hit(2, "kmpAcctService")
        if (loadClass(names.rightViewAgency, cl) != null) hit(1, "rightViewAgency")

        return Match(
            names = names,
            score = score,
            reason = if (hits.isEmpty()) "no-known-signature" else hits.joinToString(","),
        )
    }

    private fun normalizeVersion(versionName: String?): String =
        versionName?.trim()?.substringBefore(' ')?.substringBefore('(')?.trim().orEmpty()

    private fun loadClass(name: String, cl: ClassLoader): Class<*>? {
        if (name.isBlank()) return null
        return try {
            Class.forName(name, false, cl)
        } catch (_: Throwable) {
            null
        }
    }

    private fun hasMethod(clazz: Class<*>, name: String): Boolean {
        if (name.isBlank()) return false
        return try {
            clazz.declaredMethods.any { it.name == name } || clazz.methods.any { it.name == name }
        } catch (_: Throwable) {
            false
        }
    }

    private fun hasField(clazz: Class<*>, name: String): Boolean {
        if (name.isBlank()) return false
        return try {
            clazz.declaredFields.any { it.name == name } || clazz.fields.any { it.name == name }
        } catch (_: Throwable) {
            false
        }
    }

    private const val MIN_CONFIDENCE_SCORE = 10
}
