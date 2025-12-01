# System Architecture

![System Architecture](images/get.png)

## Overview

This document describes the system architecture for the application, including AWS infrastructure, networking, deployment pipeline, and data flow.

## Architecture Diagram

Below is the system architecture diagram:

![System Architecture](./images/get.png)

## Components

### 1. **User & Admin**

* Users interact with the system through a web or mobile interface.
* Admins manage infrastructure and services using secure access via SSH.

### 2. **Amazon Route 53**

* Handles DNS routing for end‑user traffic.

### 3. **CloudFront**

* Serves static content from S3.
* Improves performance using CDN caching.

### 4. **Amazon S3**

* Stores static assets.
* Stores logs and artifacts.

### 5. **VPC (Virtual Private Cloud)**

Contains:

* Public Subnet (NAT Gateway, ALB, Bastion Host)
* Private Subnet (ECS, API services)
* Private Subnet (Amazon RDS)

### 6. **Application Load Balancer (ALB)**

* Routes traffic to ECS services.

### 7. **NAT Gateway**

* Enables outbound internet for ECS tasks.

### 8. **Bastion Host**

* Used for secure SSH access to private resources.

### 9. **Amazon ECS (Fargate or EC2)**

* Runs the API service.
* Pulls container images from ECR.

### 10. **Amazon RDS**

* Stores relational data.

### 11. **CloudWatch**

* Collects logs and system metrics.

### 12. **CloudTrail**

* Tracks API calls and governance logs.

---

## API Endpoints

All routes have been updated to use `get-a-request` instead of `get-a-quote`.

Example:

* `POST /api/v1/get-a-request`
* `GET /api/v1/get-a-request/:id`
* `PUT /api/v1/get-a-request/:id`
* `DELETE /api/v1/get-a-request/:id`

---

## Deployment Flow

1. Developer pushes code to GitHub.
2. CI/CD pipeline builds and pushes Docker image to ECR.
3. ECS pulls the latest version and deploys.

Git push command:

```bash
git add .
git commit -m "update get-a-request routes and add architecture readme"
git push origin main
```

---

## CI/CD Pipeline with Jenkins

The system uses a **Jenkins‑based CI/CD pipeline** to automate building, testing, containerizing, and deploying the application to AWS.

### **CI (Continuous Integration)**

* Developer pushes code to GitHub.
* Jenkins automatically triggers a pipeline upon webhook event.
* Steps:

  * Pull latest source code.
  * Install dependencies.
  * Run automated tests.
  * Build Docker image.
  * Tag and push the image to **Amazon ECR**.

### **CD (Continuous Deployment)**

Once the new Docker image is pushed to ECR:

* Jenkins triggers deployment scripts.
* ECS Service pulls the new image.
* Rolling update ensures zero‑downtime deployment.
* CloudWatch monitors health during rollout.

### **Jenkinsfile**

```groovy
pipeline {
    agent any
    environment {
        AWS_REGION = "..."
        ECR_REPO = "...."
        CLUSTER_NAME = "..."
        SERVICE_NAME = "..."
        CONTAINER_NAME = "..." //thay thế toàn bộ các dấu ... bằng các thông tin tương ứng
        IMAGE_TAG = ""   // khai báo trước để dùng toàn pipeline
        TASK_DEF_ARN = "" // khai báo luôn
    }
    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: '...'
            }
        }

        stage('Get Commit Hash') {
            steps {
                script {
                    IMAGE_TAG = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
                    echo "Using image tag: ${IMAGE_TAG}"
                }
            }
        }

        stage('Build Docker') {
            steps {
                sh "docker build -t exam2:${IMAGE_TAG} ."
            }
        }

        stage('Login to ECR') {
            steps {
                withCredentials([usernamePassword(credentialsId: '#thay bang credential tao trong jenkins UI', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                    sh "aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REPO}"
                }
            }
        }

        stage('Tag & Push') {
            steps {
                sh "docker tag exam2:${IMAGE_TAG} ${ECR_REPO}:${IMAGE_TAG}"  #thay bang ten cua repo ecr
                sh "docker push ${ECR_REPO}:${IMAGE_TAG}"
            }
        }

        stage('Register ECS Task Definition') {
            steps {
                withCredentials([usernamePassword(credentialsId: '#ten credential', usernameVariable: 'AWS_ACCESS_KEY_ID', passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                    script {
                        def taskDefFile = "ecs-task-def-${IMAGE_TAG}.json"
                        sh "sed 's|<IMAGE_TAG>|${IMAGE_TAG}|g' ecs-task-def-template.json > ${taskDefFile}"
                        TASK_DEF_ARN = sh(script: "aws ecs register-task-definition --cli-input-json file://${taskDefFile} --query taskDefinition.taskDefinitionArn --output text", returnStdout: true).trim()
                        echo "TASK_DEF_ARN: ${TASK_DEF_ARN}"
                    }
                }
            }
        }

        stage('Deploy ECS') {
            steps {
                withCredentials([usernamePassword(credentialsId: '#credential_tao_jenkinsUI', 
                                                  usernameVariable: 'AWS_ACCESS_KEY_ID', 
                                                  passwordVariable: 'AWS_SECRET_ACCESS_KEY')]) {
                    script {
                        sh """
                        aws ecs update-service \
                            --cluster ${CLUSTER_NAME} \
                            --service ${SERVICE_NAME} \
                            --task-definition ${TASK_DEF_ARN} \
                            --force-new-deployment
                        """
                    }
                }
            }
        }

    } // <-- đóng stages

    post {
        success {
            echo "CI/CD pipeline completed successfully!"
        }
        failure {
            echo "Pipeline failed! Check logs."
        }
    }

} // <-- đóng pipeline
