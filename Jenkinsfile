
pipeline {
    agent any

    tools {
        nodejs 'NodeJS'
    }

    stages {

        stage('Checkout Verification') {
            steps {
                echo 'GitHub source code checkout successful'
            }
        }

        stage('Check Environment') {
            steps {
                bat 'node --version'
                bat 'npm --version'
                bat 'git --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                bat 'npm ci'
            }
        }

        stage('Verify Playwright') {
            steps {
                bat 'npx playwright --version'
            }
        }
    }

    post {
        success {
            echo 'Initial Jenkins pipeline completed successfully'
        }

        failure {
            echo 'Please check Console Output'
        }
    }
}
