import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { workflowTestLifecycle } from "../setup/test-harness"
import type { WorkflowTestHarness } from "../setup/test-harness"
import { seedTestActors } from "../fixtures/actors"
import { expectAsyncSuccess, expectSome } from "../../utils/test.helpers"
import { withTestClock } from "../../domain/setup/test-clock"

describe("UserWorkflow", () => {
  let harness: WorkflowTestHarness
  let actors: Awaited<ReturnType<typeof seedTestActors>>

  beforeAll(async () => {
    harness = await workflowTestLifecycle.beforeAll()
    actors = await seedTestActors(harness.db)
  })

  afterAll(async () => {
    await workflowTestLifecycle.afterAll(harness)
  })

  beforeEach(async () => {
    await workflowTestLifecycle.beforeEach(harness)
    actors = await seedTestActors(harness.db)
  })

  describe("signUp - Happy Path", () => {
    it("should create a new user and return user summary without session", async () => {
      const signUpCommand = {
        email: "newuser@example.com",
        password: "TestPassword123!",
        roles: ["USER"] as readonly string[]
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand),
          Date.now()
        )
      )

      // Assert user summary fields
      expect(response.user.email).toBe("newuser@example.com")
      expect(response.user.roles).toEqual(["USER"])
      expect(response.user.id).toBeDefined()
      expect(response.user.createdAt).toBeDefined()
      expect(response.session).toBeUndefined() // Sign-up doesn't auto-login

      // Verify user in database
      const foundOption = await expectAsyncSuccess(
        harness.userRepository.findByEmail("newuser@example.com" as any)
      )
      const found = expectSome(foundOption)
      expect(found.email).toBe("newuser@example.com")
      expect(found.roles).toEqual(["USER"])

      // Verify audit event recorded
      const auditEvents = harness.auditPort.getEventsByAction("signup")
      expect(auditEvents.length).toBeGreaterThanOrEqual(1)
      const successEvent = auditEvents.find(e => e.outcome === "success" && e.metadata?.email === "newuser@example.com")
      expect(successEvent).toBeDefined()
    })

    it("should create user with default roles when not provided", async () => {
      const signUpCommand = {
        email: "defaultuser@example.com",
        password: "TestPassword123!"
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand),
          Date.now()
        )
      )

      expect(response.user.roles).toEqual(["USER"])
    })
  })

  describe("signUp - Error Cases", () => {
    it("should fail when email already exists", async () => {
      // Create first user
      const signUpCommand1 = {
        email: "duplicate@example.com",
        password: "TestPassword123!",
        roles: ["USER"] as readonly string[]
      }

      await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand1),
          Date.now()
        )
      )

      // Attempt to create duplicate user
      const signUpCommand2 = {
        email: "duplicate@example.com",
        password: "TestPassword123!",
        roles: ["USER"] as readonly string[]
      }

      try {
        await expectAsyncSuccess(
          withTestClock(
            harness.userWorkflow.signUp(signUpCommand2),
            Date.now()
          )
        )
        throw new Error("Expected failure but got success")
      } catch (error) {
        expect(error).toBeDefined()
        const errorMessage = error instanceof Error ? error.message : String(error)
        expect(errorMessage).toContain("already exists")
      }
    })
  })

  describe("login - Happy Path", () => {
    it("should authenticate user and return token", async () => {
      // Create user first
      const signUpCommand = {
        email: "logintest@example.com",
        password: "TestPassword123!",
        roles: ["USER"] as readonly string[]
      }

      await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand),
          Date.now()
        )
      )

      // Login with correct credentials
      const loginQuery = {
        email: "logintest@example.com",
        password: "TestPassword123!"
      }

      const response = await expectAsyncSuccess(
        harness.userWorkflow.login(loginQuery)
      )

      // Assert response contains user and session
      expect(response.user.email).toBe("logintest@example.com")
      expect(response.session).toBeDefined()
      expect(response.session?.token).toBeDefined()
      expect(response.session?.expiresAt).toBeDefined()
      expect(new Date(response.session!.expiresAt).getTime()).toBeGreaterThan(Date.now())

      // Verify audit event recorded
      const auditEvents = harness.auditPort.getEventsByAction("login")
      expect(auditEvents.length).toBeGreaterThan(0)
      const successEvents = auditEvents.filter(e => e.outcome === "success")
      expect(successEvents.length).toBeGreaterThan(0)
    })
  })

  describe("login - Error Cases", () => {
    it("should fail when email does not exist", async () => {
      const loginQuery = {
        email: "nonexistent@example.com",
        password: "TestPassword123!"
      }

      try {
        await expectAsyncSuccess(harness.userWorkflow.login(loginQuery))
        throw new Error("Expected failure but got success")
      } catch (error) {
        expect(error).toBeDefined()
      }

      // Should record failed login attempt
      const auditEvents = harness.auditPort.getEventsByAction("login")
      const failureEvents = auditEvents.filter(e => e.outcome === "failure")
      expect(failureEvents.length).toBeGreaterThan(0)
    })

    it("should fail when password is incorrect", async () => {
      // Create user first
      const signUpCommand = {
        email: "wrongpass@example.com",
        password: "CorrectPassword123!",
        roles: ["USER"] as readonly string[]
      }

      await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand),
          Date.now()
        )
      )

      // Login with wrong password
      const loginQuery = {
        email: "wrongpass@example.com",
        password: "WrongPassword123!"
      }

      try {
        await expectAsyncSuccess(harness.userWorkflow.login(loginQuery))
        throw new Error("Expected failure but got success")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe("changePassword - Happy Path", () => {
    it("should change password when user is changing own password", async () => {
      // Create and login user
      const signUpCommand = {
        email: "changepass@example.com",
        password: "OldPassword123!",
        roles: ["USER"] as readonly string[]
      }

      const signUpResponse = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand),
          Date.now()
        )
      )

      const userId = signUpResponse.user.id

      // Change password
      const changePasswordCommand = {
        userId,
        oldPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
        actorId: userId
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.changePassword(changePasswordCommand),
          Date.now()
        )
      )

      expect(response.success).toBe(true)
      expect(response.message).toBeDefined()

      // Verify new password works
      const loginQuery = {
        email: "changepass@example.com",
        password: "NewPassword123!"
      }

      await expectAsyncSuccess(
        harness.userWorkflow.login(loginQuery)
      )
    })
  })

  describe("changePassword - Error Cases", () => {
    it("should fail when old password is incorrect", async () => {
      // Create user
      const signUpCommand = {
        email: "wrongold@example.com",
        password: "CorrectPassword123!",
        roles: ["USER"] as readonly string[]
      }

      const signUpResponse = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand),
          Date.now()
        )
      )

      const userId = signUpResponse.user.id

      // Attempt to change password with wrong old password
      const changePasswordCommand = {
        userId,
        oldPassword: "WrongPassword123!",
        newPassword: "NewPassword123!",
        actorId: userId
      }

      try {
        await expectAsyncSuccess(
          withTestClock(
            harness.userWorkflow.changePassword(changePasswordCommand),
            Date.now()
          )
        )
        throw new Error("Expected failure but got success")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })

    it("should fail when non-admin tries to change another user's password", async () => {
      // Create two users
      const signUpCommand1 = {
        email: "user1@example.com",
        password: "Password123!",
        roles: ["USER"] as readonly string[]
      }

      const signUpCommand2 = {
        email: "user2@example.com",
        password: "Password123!",
        roles: ["USER"] as readonly string[]
      }

      const response1 = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand1),
          Date.now()
        )
      )

      const response2 = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand2),
          Date.now()
        )
      )

      // User1 attempts to change User2's password
      const changePasswordCommand = {
        userId: response2.user.id,
        oldPassword: "Password123!",
        newPassword: "NewPassword123!",
        actorId: response1.user.id // Different user
      }

      try {
        await expectAsyncSuccess(
          withTestClock(
            harness.userWorkflow.changePassword(changePasswordCommand),
            Date.now()
          )
        )
        throw new Error("Expected failure but got success")
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe("changePassword - Admin Access", () => {
    it("should allow admin to change any user's password", async () => {
      // Create admin user
      const adminSignUpCommand = {
        email: "admin@example.com",
        password: "AdminPassword123!",
        roles: ["USER", "ADMIN"] as readonly string[]
      }

      // Create regular user
      const userSignUpCommand = {
        email: "regular@example.com",
        password: "UserPassword123!",
        roles: ["USER"] as readonly string[]
      }

      const adminResponse = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(adminSignUpCommand),
          Date.now()
        )
      )

      const userResponse = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(userSignUpCommand),
          Date.now()
        )
      )

      // Admin changes regular user's password
      const changePasswordCommand = {
        userId: userResponse.user.id,
        oldPassword: "UserPassword123!",
        newPassword: "NewUserPassword123!",
        actorId: adminResponse.user.id
      }

      const response = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.changePassword(changePasswordCommand),
          Date.now()
        )
      )

      expect(response.success).toBe(true)

      // Verify new password works for regular user
      const loginQuery = {
        email: "regular@example.com",
        password: "NewUserPassword123!"
      }

      await expectAsyncSuccess(
        harness.userWorkflow.login(loginQuery)
      )
    })
  })

  describe("getProfile", () => {
    it("should return user profile for authenticated user", async () => {
      // Create user
      const signUpCommand = {
        email: "profile@example.com",
        password: "TestPassword123!",
        roles: ["USER", "ADMIN"] as readonly string[]
      }

      const signUpResponse = await expectAsyncSuccess(
        withTestClock(
          harness.userWorkflow.signUp(signUpCommand),
          Date.now()
        )
      )

      const userId = signUpResponse.user.id

      // Get profile
      const getProfileQuery = {
        actorId: userId
      }

      const response = await expectAsyncSuccess(
        harness.userWorkflow.getProfile(getProfileQuery)
      )

      // Assert profile fields
      expect(response.email).toBe("profile@example.com")
      expect(response.roles).toEqual(["USER", "ADMIN"])
      expect(response.id).toBe(userId)
      expect(response.createdAt).toBeDefined()
    })

    it("should return profile for any user", async () => {
      // Get a user from fixtures
      const actor = actors.owner
      
      const getProfileQuery = {
        actorId: actor.id
      }

      const response = await expectAsyncSuccess(
        harness.userWorkflow.getProfile(getProfileQuery)
      )

      expect(response.id).toBe(actor.id)
      expect(response.email).toBe(actor.email)
      expect(response.roles).toEqual(actor.roles)
    })
  })
})

