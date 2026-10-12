

pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Check Node.js') {
            steps {
                bat 'git --version'
                bat 'node --version'
                bat 'npm --version'
            }
        }

        stage('Validate Project') {
            steps {
                bat '''
                    if not exist index.html (
                        echo ERROR: index.html not found
                        exit /b 1
                    )
                    echo HTML entry file found.
                    dir
                '''
            }
        }

        stage('Build') {
            steps {
                script {
                    if (fileExists('package.json')) {
                        bat 'call npm install'
                        bat 'call npm run build --if-present'
                    } else {
                        echo 'Static HTML/CSS/JavaScript project detected.'
                        echo 'No npm build step is required.'
                    }
                }
            }
        }
    }

    post {
        success {
            echo 'Pipeline completed successfully!'
        }
        failure {
            echo 'Pipeline failed. Check Console Output.'
        }
    }
}
